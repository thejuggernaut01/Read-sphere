import { Module } from '@nestjs/common';
import { BookController } from './book.controller';
import { BookService } from './book.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { BookModel } from './model/book.model';

@Module({
  imports: [SequelizeModule.forFeature([BookModel])],
  controllers: [BookController],
  providers: [BookService],
})
export class BookModule {}
