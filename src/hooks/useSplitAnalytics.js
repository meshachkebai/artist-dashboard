import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const useSplitAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSplitAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get all track contributors with splits
        const { data: contributors, error: contribError } = await supabase
          .from('track_contributors')
          .select('role, split_percentage');

        if (contribError) throw contribError;

        // Calculate average split by role
        const splitsByRole = {};
        const countsByRole = {};

        contributors.forEach(contrib => {
          if (contrib.split_percentage) {
            if (!splitsByRole[contrib.role]) {
              splitsByRole[contrib.role] = 0;
              countsByRole[contrib.role] = 0;
            }
            splitsByRole[contrib.role] += contrib.split_percentage;
            countsByRole[contrib.role]++;
          }
        });

        const averageSplitsByRole = Object.keys(splitsByRole).map(role => ({
          role,
          averageSplit: (splitsByRole[role] / countsByRole[role]).toFixed(1),
          count: countsByRole[role]
        })).sort((a, b) => parseFloat(b.averageSplit) - parseFloat(a.averageSplit));

        // Calculate split distribution
        const totalWithSplits = contributors.filter(c => c.split_percentage).length;
        const totalWithoutSplits = contributors.filter(c => !c.split_percentage).length;

        setData({
          averageSplitsByRole,
          totalWithSplits,
          totalWithoutSplits,
          splitCoverage: totalWithSplits + totalWithoutSplits > 0 
            ? ((totalWithSplits / (totalWithSplits + totalWithoutSplits)) * 100).toFixed(1)
            : 0
        });
      } catch (err) {
        console.error('Error fetching split analytics:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSplitAnalytics();
  }, []);

  return { data, loading, error };
};
