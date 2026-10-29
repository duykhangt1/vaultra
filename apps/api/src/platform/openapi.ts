import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { IDEMPOTENT, INTERNAL, IS_PUBLIC, PERMISSION, RATE_LIMIT } from '../auth/decorators';

type Op = Record<string, unknown>;
const VERBS: Record<number, string> = { [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put', [RequestMethod.DELETE]: 'delete', [RequestMethod.PATCH]: 'patch' };
/** Nest's RouteParamtypes: 3 = @Body(), 4 = @Query(), 6 = @Headers(). */
const BODY = 3;
const QUERY = 4;
const HEADERS = 6;
