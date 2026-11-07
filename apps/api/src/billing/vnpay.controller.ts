import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public, RateLimit } from '../auth/decorators';
import { config } from '../common/config';
import { isAllowedOrigin } from '../common/origin';
import { PrismaService } from '../common/prisma.service';
import { PaymentService } from './payment.service';

/** VNPay callbacks (spec §8.4.2). Separate controller so it never collides with the generic gateway routes. */
@Controller()
export class VnpayController {
  constructor(private payments: PaymentService, private prisma: PrismaService) {}

  /** IPN — VNPay calls this server-to-server and expects its RspCode JSON. In the sandbox it needs a public URL (ngrok etc.). */
  @Public()
  @RateLimit(120, 60)
  @Get('payments/vnpay/ipn')
  async ipn(@Query() query: Record<string, unknown>) {
    try {
      const r = await this.payments.vnpayCallback(query, 'ipn');
      switch (r.code) {
        case 'OK': return { RspCode: '00', Message: 'Confirm Success' };
        case 'ALREADY_CONFIRMED': return { RspCode: '02', Message: 'Order already confirmed' };
        case 'INVALID_SIGNATURE': return { RspCode: '97', Message: 'Invalid signature' };
        case 'ORDER_NOT_FOUND': return { RspCode: '01', Message: 'Order not found' };
        case 'INVALID_AMOUNT': return { RspCode: '04', Message: 'Invalid amount' };
      }
    } catch {
      return { RspCode: '99', Message: 'Unknown error' };
    }
  }

  /** Browser return: signature verified and outcome applied (idempotent), then the customer lands back in the app. */
  @Public()
  @RateLimit(60, 60)
  @Get('payments/vnpay/return')
  async ret(@Query() query: Record<string, unknown>, @Res() res: Response) {
    let publicId = '';
    let status = 'UNKNOWN';
    let returnPath = '/app/billing';
    let appOrigin = config.appOrigin;
    try {
      const r = await this.payments.vnpayCallback(query, 'return');
      if ('publicId' in r && r.publicId) {
        publicId = r.publicId;
        if ('status' in r && r.status) status = r.status;
        const pay = await this.prisma.payment.findUnique({ where: { public_id: publicId }, select: { raw_response: true } });
        const raw = pay?.raw_response as { return_path?: string; app_origin?: string } | null;
        if (raw?.return_path && raw.return_path.startsWith('/')) returnPath = raw.return_path;
        if (raw?.app_origin && isAllowedOrigin(raw.app_origin)) appOrigin = raw.app_origin.replace(/\/+$/, '');
      } else if (r.code === 'INVALID_SIGNATURE') status = 'INVALID';
    } catch { /* fall through: the app shows the payment as it really is */ }
    res.redirect(`${appOrigin}${returnPath}${returnPath.includes('?') ? '&' : '?'}payment=${publicId}&status=${status}`);
  }
}
