import { useEffect, useId, useRef, useState } from 'react';
import { RefreshCw, Upload } from 'lucide-react';
import { Alert, Button } from '@/ui';

type Cam = { id: string; label: string };
