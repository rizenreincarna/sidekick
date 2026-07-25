import { db } from "@/lib/db";

export async function getSheetsConfig(userId: string) {
  const settings = await db.setting.findMany({
    where: { key: { in: ["google_sheets_id", "google_service_account"] }, userId },
  });
  const config: Record<string, string> = {};
  for (const s of settings) {
    config[s.key] = s.value;
  }
  return {
    spreadsheetId: config.google_sheets_id || "",
    serviceAccount: config.google_service_account || "",
  };
}

export async function setSheetsConfig(spreadsheetId: string, serviceAccount: string, userId: string) {
  await db.setting.upsert({
    where: { userId_key: { userId, key: "google_sheets_id" } },
    update: { value: spreadsheetId },
    create: { key: "google_sheets_id", value: spreadsheetId, userId },
  });
  await db.setting.upsert({
    where: { userId_key: { userId, key: "google_service_account" } },
    update: { value: serviceAccount },
    create: { key: "google_service_account", value: serviceAccount, userId },
  });
}

interface SheetOrder {
  orderId: string;
  customerName: string;
  phone: string;
  address: string;
  city: string;
  size: string;
  isOffice: boolean;
  zone: number;
  scheduledDate: string | null;
  status: string;
  notes: string | null;
}

export async function syncToSheet(orders: SheetOrder[], spreadsheetId: string, serviceAccountJson: string) {
  const { google } = await import("googleapis");

  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "A2:Z" });

  const header = ["Order ID", "Customer Name", "Phone", "Address", "City", "Size", "Is Office", "Zone", "Scheduled Date", "Status", "Notes"];
  const rows = orders.map(o => [
    o.orderId, o.customerName, o.phone, o.address, o.city, o.size,
    o.isOffice ? "Yes" : "No", o.zone.toString(), o.scheduledDate || "", o.status, o.notes || "",
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId, range: "A1", valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] },
  });

  return { success: true, rowsWritten: rows.length };
}

export async function importFromSheet(spreadsheetId: string, serviceAccountJson: string) {
  const { google } = await import("googleapis");

  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });

  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: "A2:K" });
  const rows = response.data.values || [];
  return rows.map((row: string[]) => ({
    orderId: row[0] || "", customerName: row[1] || "", phone: row[2] || "",
    address: row[3] || "", city: row[4] || "", size: row[5] || "S",
    isOffice: (row[6] || "").toLowerCase() === "yes", zone: parseInt(row[7]) || 4,
    scheduledDate: row[8] || null, status: row[9] || "PENDING", notes: row[10] || null,
  })).filter((o: { orderId: string }) => o.orderId);
}
