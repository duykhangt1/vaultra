/**
 * NFR-03: 100 concurrent bookings for the LAST available unit of a type → exactly 1 succeeds, 99 get UNIT_TYPE_SOLD_OUT.
 * Runs in-process against the real MySQL (SELECT … FOR UPDATE on unit_types + unique open_unit_key).
 */
process.env.JOBS_ENABLED = 'false';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
