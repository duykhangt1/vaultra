import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Ctx, Internal, Public } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { PrismaService } from '../common/prisma.service';
import { MediaService } from '../media/media.service';
import { pageParams, paged, parse } from '../common/http';
import { notFound, forbidden, validation } from '../common/errors';
import { JobsService } from '../jobs/jobs.service';
import { ClockService } from '../common/clock.service';
import { config } from '../common/config';
import { StorageService } from '../media/storage.service';
import { ModulesContainer } from '@nestjs/core';
import { buildOpenApiPaths } from './openapi';


function collectTenantFacilityCustomerOkChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

type CoreScopedMoveoutPlatformPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
const OPENAPI_SUMMARIES: Record<string, string> = {
      'get /health/live': 'Liveness probe',
      'get /health/ready': 'Readiness probe',
      'post /auth/register': 'Đăng ký tài khoản khách hàng',
      'post /auth/login': 'Đăng nhập bằng email & mật khẩu',
      'post /auth/refresh': 'Làm mới access token qua HttpOnly cookie',
      'get /catalog/facilities': 'Danh sách cơ sở kho công khai',
      'get /catalog/unit-types': 'Tìm kiếm loại kho trống theo ngày',
      'post /catalog/size-advisor': 'Gợi ý kích thước kho từ danh mục đồ đạc',
      'post /quotes': 'Tạo báo giá 30 phút (khoá giá & kiểm tra khuyến mãi)',
      'get /reservations': 'Danh sách đặt chỗ',
      'post /reservations': 'Tạo đặt chỗ (yêu cầu Idempotency-Key)',
      'post /checkin-sessions': 'Bắt đầu phiên nhận kho tại quầy',
      'get /contracts': 'Danh sách hợp đồng thuê kho',
      'get /move-out-requests': 'Danh sách yêu cầu trả kho',
      'get /invoices': 'Danh sách hóa đơn',
      'get /payments': 'Danh sách giao dịch thanh toán',
      'get /refunds': 'Danh sách yêu cầu hoàn tiền',
      'get /delinquency': 'Danh sách hồ sơ công nợ quá hạn',
      'get /policies': 'Danh sách chính sách và phiên bản',
      'get /tickets': 'Danh sách phiếu hỗ trợ',
      'post /tickets': 'Tạo phiếu hỗ trợ',
      'get /reports/{code}': 'Truy vấn báo cáo vận hành/tài chính',
      'post /assistant/chat': 'Trò chuyện với trợ lý AI (SSE)',
};
