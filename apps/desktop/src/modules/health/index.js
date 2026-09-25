import { HeartPulse, TrendingUp } from 'lucide-react';
import { Trends } from './Trends.jsx';
import { HealthOverviewCard } from './OverviewCard.jsx';

/** Apple Health data sent by the Olaf iPhone app. */
export const health = {
  id: 'health',
  name: 'Health',
  icon: HeartPulse,
  screens: [{ id: 'trends', label: 'Trends', icon: TrendingUp, component: Trends }],
  OverviewCard: HealthOverviewCard,
};
