import { format, parseISO } from "date-fns";
import type { Order } from "@/types/page";
import { DEFAULT_WHATSAPP_TEMPLATES } from "@/types/page";
import { fmtMalaysiaTime } from "@/lib/vroom";
import type { VroomStopDetail } from "@/lib/vroom";

export function fillTemplate(template: string, order: Order): string {
  const date = order.scheduledDate ? format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)") : "TBD";
  return template
    .replace(/\{customerName\}/g, order.customerName)
    .replace(/\{date\}/g, date)
    .replace(/\{address\}/g, order.address)
    .replace(/\{phone\}/g, order.phone)
    .replace(/\{orderId\}/g, order.orderId)
    .replace(/\{size\}/g, order.size)
    .replace(/\{points\}/g, order.points.toString())
    .replace(/\{city\}/g, order.city)
    .replace(/\{notes\}/g, order.notes || "N/A")
    .replace(/\{arrival\}/g, "N/A")
    .replace(/\{trackUrl\}/g, "N/A");
}

/** Fill a route-optimizer WhatsApp template using a VroomStopDetail + context */
export function fillRouteTemplate(
  template: string,
  stop: VroomStopDetail,
  routeDate: string,
  trackUrl: string | null,
): string {
  const arrival = fmtMalaysiaTime(stop.plannedArrival ?? stop.arrival);
  const date = routeDate || "TBD";
  return template
    .replace(/\{customerName\}/g, stop.customerName)
    .replace(/\{date\}/g, date)
    .replace(/\{address\}/g, stop.address)
    .replace(/\{arrival\}/g, arrival)
    .replace(/\{trackUrl\}/g, trackUrl || "");
}

export function formatPhoneForWhatsApp(phone: string, prefix: string = "60"): string {
  if (phone.startsWith("+")) return phone.substring(1);
  if (phone.startsWith(prefix)) return phone;
  return `${prefix}${phone.replace(/^0/, "")}`;
}

export function getWhatsAppLink(order: Order, template?: string, phonePrefix?: string): string {
  const msg = template ? fillTemplate(template, order) : fillTemplate(DEFAULT_WHATSAPP_TEMPLATES[0].message, order);
  const phone = formatPhoneForWhatsApp(order.phone, phonePrefix || "60");
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
