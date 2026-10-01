import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { createVietnamMap, pinIcon, validCoords } from './vnmap';

type Pt = { id: string; lat: number; lng: number; label: string; sub?: string; href?: string };
