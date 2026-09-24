import { Footprints, Route, ListChecks } from 'lucide-react';
import { Workouts } from './Workouts.jsx';
import { Plan } from './Plan.jsx';
import { RunningOverviewCard } from './OverviewCard.jsx';

/** Running (Polar) - the first Snowman module. */
export const running = {
  id: 'running',
  name: 'Running',
  icon: Footprints,
  screens: [
    { id: 'workouts', label: 'Workouts', icon: Route, component: Workouts },
    { id: 'plan', label: 'Plan', icon: ListChecks, component: Plan },
  ],
  OverviewCard: RunningOverviewCard,
};
