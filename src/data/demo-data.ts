import type { ActivityEvent, Asset, Assignment, Location, Person, Ticket } from '@/domain/types';
import type { AssetStatus, Category, TicketPriority, TicketStatus } from '@/domain/enums';
import { addDays } from '@/domain/util';

export interface DemoDeps {
  id: () => string;
  now: () => string;
  /** Local calendar date, injected so tests are deterministic. */
  today: string;
}

export interface DemoData {
  locations: Location[];
  people: Person[];
  assets: Asset[];
  assignments: Assignment[];
  tickets: Ticket[];
  activity: ActivityEvent[];
}

const LOCATIONS = ['HQ · Floor 1 (Reception)', 'HQ · Floor 2 (Open space)', 'HQ · Server room', 'Warehouse', 'Remote / home office'];

// first, last, position, department, location index, status
const PEOPLE: [string, string, string, string, number, 'active' | 'inactive'][] = [
  ['Olena', 'Kovalenko', 'System Administrator', 'IT', 2, 'active'],
  ['Andrii', 'Shevchenko', 'Software Engineer', 'Engineering', 1, 'active'],
  ['Iryna', 'Bondar', 'HR Manager', 'Human Resources', 0, 'active'],
  ['Taras', 'Melnyk', 'Accountant', 'Finance', 0, 'active'],
  ['Maria', 'Lysenko', 'Product Designer', 'Engineering', 1, 'active'],
  ['Pavlo', 'Savchenko', 'Support Engineer', 'IT', 2, 'active'],
  ['Natalia', 'Tkachenko', 'Sales Manager', 'Sales', 4, 'active'],
  ['Dmytro', 'Kravets', 'Former Developer', 'Engineering', 1, 'inactive'],
];

// name, manufacturer, model, category, status, location idx, holder idx|null, purchase offset (days), warranty offset (days)|null, supplier, cost
type Spec = [string, string, string, Category, AssetStatus, number, number | null, number, number | null, string, number];
const ASSETS: Spec[] = [
  ['Laptop', 'Dell', 'Latitude 5440', 'laptop', 'in_use', 2, 0, -260, 470, 'Comfy', 1180],
  ['Laptop', 'Lenovo', 'ThinkPad T14 Gen 4', 'laptop', 'in_use', 1, 1, -420, 310, 'Comfy', 1320],
  ['Laptop', 'Apple', 'MacBook Pro 14"', 'laptop', 'in_use', 1, 4, -150, 580, 'iStore', 2450],
  ['Laptop', 'HP', 'EliteBook 840 G9', 'laptop', 'in_use', 0, 2, -700, 25, 'Comfy', 1210],
  ['Laptop', 'Dell', 'Latitude 7420', 'laptop', 'in_stock', 3, null, -900, -40, 'Comfy', 1390],
  ['Desktop', 'HP', 'ProDesk 400 G9', 'desktop', 'in_use', 0, 3, -1100, -330, 'Rozetka Business', 760],
  ['Desktop', 'Dell', 'OptiPlex 7010', 'desktop', 'in_use', 2, 5, -500, 220, 'Comfy', 890],
  ['Monitor', 'LG', 'UltraFine 27UN850', 'monitor', 'in_use', 1, 1, -420, 310, 'Foxtrot', 430],
  ['Monitor', 'Dell', 'U2723QE', 'monitor', 'in_use', 1, 4, -150, 580, 'Foxtrot', 560],
  ['Monitor', 'Samsung', 'S24R350', 'monitor', 'in_stock', 3, null, -800, 12, 'Foxtrot', 160],
  ['Monitor', 'AOC', '24B2XH', 'monitor', 'in_stock', 3, null, -45, 685, 'Foxtrot', 120],
  ['Network switch', 'Cisco', 'Catalyst 2960-X', 'network_equipment', 'in_use', 2, null, -1500, -200, 'NetPro', 1800],
  ['Wi-Fi access point', 'Ubiquiti', 'UniFi U6-Pro', 'network_equipment', 'in_use', 1, null, -380, 350, 'NetPro', 160],
  ['Router', 'MikroTik', 'RB4011', 'network_equipment', 'in_use', 2, null, -610, 120, 'NetPro', 230],
  ['Printer', 'HP', 'LaserJet Pro M404', 'printer', 'in_use', 0, null, -1300, null, 'Rozetka Business', 340],
  ['Printer', 'Brother', 'HL-L2350DW', 'printer', 'under_repair', 0, null, -980, 90, 'Rozetka Business', 190],
  ['Smartphone', 'Samsung', 'Galaxy A54', 'mobile_device', 'in_use', 4, 6, -330, 400, 'Kyivstar Shop', 420],
  ['Tablet', 'Apple', 'iPad 10th gen', 'mobile_device', 'reserved', 3, null, -60, 670, 'iStore', 520],
  ['Smartphone', 'Xiaomi', 'Redmi Note 12', 'mobile_device', 'lost', 4, null, -540, null, 'Kyivstar Shop', 230],
  ['File server', 'Dell', 'PowerEdge R450', 'server', 'in_use', 2, null, -1200, 160, 'ServerHouse', 4800],
  ['NAS', 'Synology', 'DS923+', 'server', 'in_use', 2, null, -700, 380, 'ServerHouse', 1050],
  ['Docking station', 'Dell', 'WD22TB4', 'peripheral', 'in_stock', 3, null, -300, 430, 'Comfy', 290],
  ['Headset', 'Jabra', 'Evolve2 65', 'peripheral', 'in_use', 4, 6, -330, 400, 'Comfy', 210],
  ['Laptop', 'Lenovo', 'ThinkPad E15', 'laptop', 'retired', 3, null, -2300, -1500, 'Comfy', 780],
  ['Microsoft 365 Business', 'Microsoft', 'Business Standard (10 seats)', 'software', 'in_use', 2, null, -200, 165, 'Microsoft Partner', 1500],
];

// title, problem, priority, status, asset index, specialist idx, workDone, cost
type TicketSpec = [string, string, TicketPriority, TicketStatus, number, number | null, string, number | null];
const TICKETS: TicketSpec[] = [
  ['Printer jams paper', 'Paper jams in the rear tray on every second job.', 'medium', 'in_progress', 15, 5, '', null],
  ['Laptop battery swells', 'Battery is swollen and the case is lifting.', 'high', 'resolved', 3, 0, 'Replaced battery with a genuine part, case checked.', 85],
  ['Switch port 12 dead', 'No link on port 12 after a power cut.', 'high', 'waiting', 11, 0, 'Waiting for spare module from the supplier.', null],
  ['Monitor flickers', 'Intermittent flicker at 60 Hz.', 'low', 'closed', 7, 5, 'Cable replaced, issue gone.', 12],
  ['Laptop will not boot', 'Black screen after update.', 'critical', 'open', 1, null, '', null],
];

export function buildDemoData(deps: DemoDeps): DemoData {
  const { id, now, today } = deps;
  const stamp = now();
  const mk = <T extends { isDemo: boolean }>(x: Omit<T, 'isDemo'>): T => ({ ...x, isDemo: true } as T);

  const locations: Location[] = LOCATIONS.map((name) =>
    mk<Location>({ id: id(), name, description: '', createdAt: stamp, updatedAt: stamp }));

  const people: Person[] = PEOPLE.map(([firstName, lastName, position, department, loc, status]) =>
    mk<Person>({
      id: id(), firstName, lastName, position, department,
      email: `${firstName}.${lastName}@demo.example`.toLowerCase(), phone: '', locationId: locations[loc]!.id,
      status, startDate: addDays(today, -800), deactivatedAt: status === 'inactive' ? stamp : null, notes: '',
      createdAt: stamp, updatedAt: stamp,
    }));

  const assets: Asset[] = [];
  const assignments: Assignment[] = [];
  const activity: ActivityEvent[] = [];
  const ev = (type: ActivityEvent['type'], entityType: ActivityEvent['entityType'], entityId: string, label: string, extra: Partial<ActivityEvent> = {}): void => {
    activity.push({ id: id(), at: stamp, type, entityType, entityId, entityLabel: label, assetId: null, personId: null, changes: [], params: {}, ...extra });
  };

  ASSETS.forEach(([name, manufacturer, model, category, status, loc, holder, purchase, warranty, supplier, cost], i) => {
    const n = String(i + 1).padStart(4, '0');
    const assetId = id();
    const assigneeId = holder === null ? null : people[holder]!.id;
    const asset: Asset = {
      id: assetId, inventoryNumber: `DEMO-${n}`, name, manufacturer, model, serialNumber: category === 'software' ? '' : `DEMO-SN-${n}`,
      category, status, locationId: locations[loc]!.id, assigneeId,
      purchaseDate: addDays(today, purchase), commissionedDate: addDays(today, purchase + 5),
      warrantyEndDate: warranty === null ? '' : addDays(today, warranty), supplier, cost,
      description: '', notes: '', isDemo: true, createdAt: stamp, updatedAt: stamp,
    };
    assets.push(asset);
    ev('asset.created', 'asset', assetId, `${asset.inventoryNumber} · ${name}`, { assetId, personId: assigneeId });
    if (assigneeId) {
      assignments.push({ id: id(), assetId, personId: assigneeId, assignedAt: stamp, returnedAt: null, endReason: null, note: '', isDemo: true });
    }
  });

  // A little history: the in-stock laptop used to belong to the former employee.
  const former = people[7]!;
  const stockLaptop = assets[4]!;
  assignments.push({
    id: id(), assetId: stockLaptop.id, personId: former.id, assignedAt: stamp, returnedAt: stamp,
    endReason: 'offboarding', note: 'Offboarding: Dmytro Kravets', isDemo: true,
  });

  const tickets: Ticket[] = TICKETS.map(([title, problem, priority, status, ai, spec, workDone, cost]) => {
    const asset = assets[ai]!;
    const ticket: Ticket = {
      id: id(), assetId: asset.id, title, problem, priority, status, specialistId: spec === null ? null : people[spec]!.id,
      workDone, cost, createdAt: stamp, updatedAt: stamp,
      resolvedAt: status === 'resolved' || status === 'closed' ? stamp : null, closedAt: status === 'closed' ? stamp : null, isDemo: true,
    };
    ev('ticket.created', 'ticket', ticket.id, title, { assetId: asset.id, params: { asset: `${asset.inventoryNumber} · ${asset.name}`, priority } });
    return ticket;
  });

  locations.forEach((l) => ev('location.created', 'location', l.id, l.name));
  people.forEach((p) => ev('person.created', 'person', p.id, `${p.firstName} ${p.lastName}`, { personId: p.id }));

  return { locations, people, assets, assignments, tickets, activity };
}
