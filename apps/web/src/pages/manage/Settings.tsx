import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, put, patch, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, PageHeader, Button, Badge, Field, Input, Textarea, Select, Switch, Tabs, DataTable, EmptyState } from '@/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn } from '../kit';
import { useFacility } from '../shared/Ops';
import { WeekHours, hoursError, type Hours } from '@/widgets/WeekHours';

const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const TYPE_L: Record<string, string> = { MOVE_IN: 'Nhận kho', MOVE_OUT: 'Trả kho', BOTH: 'Cả hai' };
