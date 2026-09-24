// Module registry for Olaf's home. Adding a module (smart home, car,
// calendar, lists...) = add one descriptor here:
//   { id, name, icon, screens: [{ id, label, icon, component }], OverviewCard }
// - screens are routed at #/m/<id>/<screen>/<param?> and listed in the sidebar
// - OverviewCard receives GET /v1/admin/overview -> modules[<id>] (the backend
//   side registers it with ctx.admin.registerOverview('<id>', ...)).
import { running } from './running/index.js';

export const modules = [running];

export function findModule(id) {
  return modules.find((m) => m.id === id) || null;
}
