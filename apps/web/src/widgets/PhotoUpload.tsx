import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { uploadFile } from '@/lib/api';
import { toast } from '@/ui/toast';
import { Spinner } from '@/ui';

export type Photo = { id: string; name: string; url: string };
