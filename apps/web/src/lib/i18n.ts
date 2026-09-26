import { useEffect } from 'react';
import { create } from 'zustand';
import { patch, post } from './api';

export type Locale = 'vi' | 'en';

const STORAGE_KEY = 'vaultra:locale';
const CACHE_KEY = 'vaultra:i18n:api-cache:v2';
