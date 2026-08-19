import { useState, useEffect } from 'react';
import { getDb } from './db';
import { DatabaseState } from './types';

export function useDb(): DatabaseState {
  const [db, setDb] = useState<DatabaseState>(getDb());

  useEffect(() => {
    const handler = () => {
      setDb(getDb());
    };
    window.addEventListener('db-updated', handler);
    return () => window.removeEventListener('db-updated', handler);
  }, []);

  return db;
}
