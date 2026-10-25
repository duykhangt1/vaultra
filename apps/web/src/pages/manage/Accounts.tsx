import { useState } from 'react';
import { Building2, Plus, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { get, post, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Avatar, Badge, Button, Card, CardHead, Drawer, Field, FilterBar, Input, Modal, PageHeader, PagedTable, Select, Tabs } from '@/ui';
import { fmtDateTime } from '@/lib/format';
import { ActBtn, REASON } from '../kit';

const STATUS: Record<string, [any, string]> = {
  ACTIVE: ['ok', 'Hoạt động'],
  INVITED: ['info', 'Chờ kích hoạt'],
  LOCKED: ['bad', 'Bị khóa'],
  DISABLED: ['neutral', 'Vô hiệu'],
  PENDING_VERIFICATION: ['warn', 'Chờ xác minh'],
};
const inv = ['/facility-accounts'];
