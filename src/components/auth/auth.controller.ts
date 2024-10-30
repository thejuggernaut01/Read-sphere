import { AuthService } from './auth.service';
import { Body, Controller, Post, Patch, Param, Res } from '@nestjs/common';
import {
  CreateUserDto,
  ForgotPasswordDto,
  LoginDto,
  ResendVerifyEmailDto,
  VerifyEmailDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { SerializeResponse } from '../../common/interceptors/response-serializer.interceptor';
import { UserDto } from '../user/dto/user.dto';
import { ResponseMessage } from '../../common/decorator/response.decorator';
import { RESPONSE_CONSTANT } from '../../common/constants/response.constant';
import { Response } from 'express';
import { isProduction } from '../../common/config/environment';

@Controller('auth')
@SerializeResponse(UserDto)
export class AuthController {
  constructor(private authService: AuthService) {}

  @ResponseMessage(RESPONSE_CONSTANT.AUTH.REGISTER_SUCCESS)
  @Post('/signup')
  async signup(@Body() body: CreateUserDto) {
    await this.authService.signup(body);
  }

  @ResponseMessage(RESPONSE_CONSTANT.AUTH.LOGIN_SUCCESS)
  @Post('/login')
  async login(@Body() body: LoginDto, @Res() res: Response) {
    const user = await this.authService.login(body);

    // Set the refresh-token cookie
    res.cookie('readsphere-token', user.refreshToken, {
      secure: isProduction,
      httpOnly: true,
      path: '/',
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return user;
  }

  @ResponseMessage(RESPONSE_CONSTANT.AUTH.EMAIL_VERIFICATION_SUCCESS)
  @Post('/verify-email')
  async verifyEmail(@Body() body: VerifyEmailDto) {
    await this.authService.verifyEmail(body);
  }

  @ResponseMessage(RESPONSE_CONSTANT.AUTH.SEND_VERIFICATION_EMAIL_SUCCESS)
  @Post('/resend-verify-email')
  async resendVerifyEmail(@Body() body: ResendVerifyEmailDto) {
    await this.authService.resendVerifyEmail(body);
  }

  @ResponseMessage(RESPONSE_CONSTANT.AUTH.PASSWORD_RESET_EMAIL_SUCCESS)
  @Post('/forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.authService.forgotPassword(body);
  }

  @ResponseMessage(RESPONSE_CONSTANT.AUTH.PASSWORD_RESET_SUCCESS)
  @Patch('/reset-password')
  async resetPassword(
    @Param('token') token: string,
    @Body() body: ResetPasswordDto,
  ) {
    await this.authService.resetPassword({ token, password: body.password });
  }
}
