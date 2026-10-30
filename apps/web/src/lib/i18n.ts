import { useEffect } from 'react';
import { create } from 'zustand';
import { patch, post } from './api';

export type Locale = 'vi' | 'en';

const STORAGE_KEY = 'vaultra:locale';
const CACHE_KEY = 'vaultra:i18n:api-cache:v2';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    /* ignore */
  }
  return 'vi';
}

export const STATUS_EN: Record<string, string> = {
  PENDING_PAYMENT: 'Pending payment',
  CONFIRMED: 'Confirmed',
  UNIT_ASSIGNED: 'Unit assigned',
  MOVE_IN_SCHEDULED: 'Move-in scheduled',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  NO_SHOW: 'No-show',
  PENDING_SIGNATURE: 'Pending signature',
  SIGNED: 'Signed',
  ACTIVE: 'Active',
  MOVE_OUT_SCHEDULED: 'Move-out scheduled',
  TERMINATED: 'Terminated',
  ENDED: 'Ended',
  CURRENT: 'Current',
  GRACE: 'Grace period',
  LATE: 'Late',
  LOCKED_OUT: 'Locked out',
  FINAL_NOTICE: 'Final notice',
  DEFAULT_PENDING: 'Default pending',
  DEFAULTED: 'Defaulted',
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
  CREDITED: 'Credited',
  WRITTEN_OFF: 'Written off',
  PENDING: 'Pending',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  PROCESSING: 'Processing',
  REJECTED: 'Rejected',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  OCCUPIED: 'Occupied',
  OVERLOCKED: 'Overlocked',
  PENDING_INSPECTION: 'Pending inspection',
  MAINTENANCE: 'Maintenance',
  OUT_OF_SERVICE: 'Out of service',
  RETIRED: 'Retired',
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING_CUSTOMER: 'Waiting customer',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
  BOOKED: 'Booked',
  ARRIVED: 'Arrived',
  MISSED: 'Missed',
  TODO: 'To do',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  OPEN: 'Open',
  INVITED: 'Invited',
  LOCKED: 'Locked',
  DISABLED: 'Disabled',
  PENDING_VERIFICATION: 'Pending verification',
  TEMPORARILY_CLOSED: 'Temporarily closed',
  INACTIVE: 'Inactive',
  SCHEDULED: 'Scheduled',
  SUPERSEDED: 'Superseded',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
  RUNNING: 'Running',
  QUEUED: 'Queued',
  SENT: 'Sent',
};

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale, syncServer?: boolean) => void;
  toggleLocale: (syncServer?: boolean) => void;
  toggle: () => void;
}
