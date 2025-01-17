import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import {
  ICreateUser,
  ILogin,
  IVerifyEmail,
  IResendVerifyEmail,
  IForgotPassword,
  IResetPassword,
} from '../user/interface';
import { BaseHelper } from '../../common/utils/helper.utils';
import { ERROR_CONSTANT } from '../../common/constants/error.constant';
import { OtpService } from '../otp/otp.service';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAME } from '../../common/constants/queue.constant';
import { Queue } from 'bullmq';
import { AUTH_JOB_NAMES } from './enum';
import { InjectModel } from '@nestjs/sequelize';
import { UserModel } from '../user/model/user.model';
import { Transaction } from 'sequelize';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UserService,
    private otpService: OtpService,
    @InjectQueue(QUEUE_NAME.AUTH) private readonly authEmailQueue: Queue,
    @InjectModel(UserModel) private readonly userModel: typeof UserModel,
  ) {}

  async signup(payload: ICreateUser) {
    const transaction: Transaction =
      await this.userModel.sequelize.transaction();

    try {
      const existingUser = await this.userModel.findOne({
        where: { email: payload.email },
      });

      if (existingUser) {
        throw new ConflictException(ERROR_CONSTANT.AUTH.USER_EXISTS);
      }

      const hashedPassword = await BaseHelper.hashData(payload.password);

      const user = this.userModel.build({
        ...payload,
        password: hashedPassword,
      });
      await user.save({ transaction });

      transaction.afterCommit(async () => {
        try {
          console.log('Transaction committed for user ID:', user.id);

          const code = await this.otpService.createOtp(user.id);
          console.log('OTP created for user ID:', user.id);

          await this.authEmailQueue.add(
            AUTH_JOB_NAMES.SEND_VERIFICATION_EMAIL,
            {
              subject: 'Verify your email',
              code,
              user: {
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
              },
            },
          );
          console.log(
            `Verification email queued for user ID: ${user.id}, Email: ${user.email}`,
          );
        } catch (error) {
          console.error(
            `Error in afterCommit hook for user ID: ${user.id}`,
            error,
          );
        }
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Error while signing up user:', error);

      if (error instanceof ConflictException) {
        throw error;
      }

      throw new InternalServerErrorException(
        ERROR_CONSTANT.AUTH.REGISTER_FAILED,
      );
    }
  }

  async login(payload: ILogin) {
    const user = await this.usersService.findUserByEmail(payload.email);

    if (!user) {
      throw new NotFoundException(ERROR_CONSTANT.AUTH.USER_DOES_NOT_EXIST);
    }

    const isPasswordValid = await BaseHelper.compareHashedData(
      payload.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new NotFoundException(ERROR_CONSTANT.AUTH.LOGIN_FAILED);
    }

    const accessToken = BaseHelper.generateJwtAccessToken(user.id);
    const refreshToken = BaseHelper.generateJwtRefreshToken(user.id);

    await this.usersService.updateUserRefreshToken(user.email, refreshToken);

    return { ...user.dataValues, accessToken, refreshToken };
  }

  async verifyEmail(payload: IVerifyEmail) {
    const user = await this.usersService.findUserByEmail(payload.email);

    if (!user) {
      throw new NotFoundException(ERROR_CONSTANT.AUTH.USER_DOES_NOT_EXIST);
    }

    await this.otpService.verifyOTP({
      userId: user.id,
      code: payload.code,
    });

    // Update the user's email verification status
    user.emailVerified = true;
    await user.save();

    await this.authEmailQueue.add(AUTH_JOB_NAMES.SEND_WELCOME_EMAIL, {
      subject: 'Welcome to Read Sphere',
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  }

  async resendVerifyEmail(payload: IResendVerifyEmail) {
    const user = await this.usersService.findUserByEmail(payload.email);

    if (!user) {
      throw new NotFoundException(ERROR_CONSTANT.AUTH.USER_DOES_NOT_EXIST);
    }

    const code = await this.otpService.createOtp(user.id);

    await this.authEmailQueue.add(AUTH_JOB_NAMES.SEND_VERIFICATION_EMAIL, {
      subject: 'Verify your email',
      code,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  }

  async forgotPassword(payload: IForgotPassword) {
    const user = await this.usersService.findUserByEmail(payload.email);

    if (!user) {
      throw new NotFoundException(ERROR_CONSTANT.AUTH.USER_DOES_NOT_EXIST);
    }

    const code = await this.otpService.createOtp(user.id);

    await this.authEmailQueue.add(AUTH_JOB_NAMES.SEND_FORGOT_PASSWORD_EMAIL, {
      subject: 'Reset your Read Sphere account password',
      code,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  }

  async resetPassword(payload: IResetPassword) {
    const { token, password } = payload;

    const hashedPassword = await BaseHelper.hashData(password);

    await this.usersService.findAndUpdateUserByResetToken(
      token,
      hashedPassword,
    );
  }
}
