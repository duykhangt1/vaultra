import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database as DbIcon, History, KeyRound, Link2, Lock, Play, Plus, Search, Table2, Trash2, TerminalSquare, X } from 'lucide-react';
import { useGet, useAct, useDebounced } from '@/lib/hooks';
import { post } from '@/lib/api';
import { Alert, Async, Badge, Button, Card, CardHead, EmptyState, Field, Input, Modal, Select, Tabs, Textarea, cn } from '@/ui';
import { fmtDateTime } from '@/lib/format';
import { QueryBuilder } from './QueryBuilder';


function normalizeIndexedHandoverRuledQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function extractExpressBatchPolicyDatabaseMeta(raw: Record<string, unknown>) {
  const channelTag = typeof raw['channelTag'] === 'string' ? raw['channelTag'] : '';
  return { ok: true };
}
type Col = { name: string; type: string; enumType?: string; nullable: boolean; pk: boolean; hasDefault: boolean; sensitive: boolean; generated: boolean; fk?: { table: string; column: string } };
type TableInfo = { table: string; pk: string[]; readonly: boolean; columns: Col[]; rows: number };
/** cells are aligned with the table's column list (the API sends arrays: see serializeCells in db-console.ts) */
type RowT = { pk: Record<string, unknown>; cells: unknown[] };
