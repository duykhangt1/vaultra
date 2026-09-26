import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed, Search } from 'lucide-react';
import { get } from '@/lib/api';
import { toast } from '@/ui/toast';
import { Button, Input } from '@/ui';
import { createVietnamMap, pinIcon, validCoords } from './vnmap';

export type PickedPlace = { latitude: number; longitude: number; displayName?: string; addressLine?: string; ward?: string; district?: string; province?: string };
