const DAY_NAMES = [
  "Domingo", "Lunes", "Martes", "Miercoles",
  "Jueves", "Viernes", "Sabado",
];

const DAY_SHORT = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MONTH_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export interface WorkingDay {
  iso: string;       // "2026-02-10"
  display: string;   // "Lun 10 Feb"
  relative: string;  // "Hoy", "Manana", etc.
  dayOfWeek: number; // 0-6
}

function getTodayIso(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA + "T00:00:00Z").getTime();
  const b = new Date(isoB + "T00:00:00Z").getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function getNextWorkingDays(
  business: { workingDays: unknown; timezone: string },
  count: number
): WorkingDay[] {
  const workingDays = (business.workingDays as number[]) || [];
  const todayIso = getTodayIso(business.timezone);
  const results: WorkingDay[] = [];
  let offset = 0;

  while (results.length < count && offset < 60) {
    const iso = addDays(todayIso, offset);
    const d = new Date(iso + "T12:00:00Z");
    const dow = d.getUTCDay();

    if (workingDays.includes(dow)) {
      const diff = daysBetween(todayIso, iso);
      let relative: string;
      if (diff === 0) relative = "Hoy";
      else if (diff === 1) relative = "Manana";
      else relative = `En ${diff} dias`;

      results.push({
        iso,
        display: `${DAY_SHORT[dow]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`,
        relative,
        dayOfWeek: dow,
      });
    }
    offset++;
  }

  return results;
}

export function formatDateSpanish(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  const dow = d.getUTCDay();
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  return `${DAY_NAMES[dow]} ${day} de ${MONTH_NAMES[month]} ${year}`;
}
