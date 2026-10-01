import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database as DbIcon, History, KeyRound, Link2, Lock, Play, Plus, Search, Table2, Trash2, TerminalSquare, X } from 'lucide-react';
import { useGet, useAct, useDebounced } from '@/lib/hooks';
import { post } from '@/lib/api';
import { Alert, Async, Badge, Button, Card, CardHead, EmptyState, Field, Input, Modal, Select, Tabs, Textarea, cn } from '@/ui';
import { fmtDateTime } from '@/lib/format';
import { QueryBuilder } from './QueryBuilder';

type Col = { name: string; type: string; enumType?: string; nullable: boolean; pk: boolean; hasDefault: boolean; sensitive: boolean; generated: boolean; fk?: { table: string; column: string } };
type TableInfo = { table: string; pk: string[]; readonly: boolean; columns: Col[]; rows: number };
/** cells are aligned with the table's column list (the API sends arrays: see serializeCells in db-console.ts) */
type RowT = { pk: Record<string, unknown>; cells: unknown[] };
type Change = { pk: Record<string, unknown>; cols: string[]; before?: unknown[]; after?: unknown[] };
type SqlRes = {
  kind: 'select' | 'update' | 'delete' | 'insert' | 'info';
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated?: boolean;
  affected?: number;
  table?: string;
  dryRun?: boolean;
  references?: { table: string; column: string; count: number }[];
  changes?: Change[];
  ms?: number;
};
