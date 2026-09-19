"use server";

import { revalidatePath } from "next/cache";

import { mergeZones, renameZone } from "@/lib/repo/zones";

export type ZoneActionResult = { error: string | null };

export async function renameZoneAction(_previous: ZoneActionResult | null, formData: FormData): Promise<ZoneActionResult> {
  const zoneId = Number(formData.get("zoneId"));
  const name = String(formData.get("name") ?? "");

  if (!Number.isInteger(zoneId)) return { error: "Invalid zone" };
  if (!name.trim()) return { error: "Name cannot be empty" };

  try {
    await renameZone(zoneId, name);
  } catch (error) {
    return { error: (error as Error).message };
  }

  revalidatePath("/zones");
  revalidatePath("/");
  return { error: null };
}

export async function mergeZonesAction(_previous: ZoneActionResult | null, formData: FormData): Promise<ZoneActionResult> {
  const sourceZoneId = Number(formData.get("sourceZoneId"));
  const targetZoneId = Number(formData.get("targetZoneId"));

  if (!Number.isInteger(sourceZoneId) || !Number.isInteger(targetZoneId)) {
    return { error: "Pick a zone to merge into" };
  }

  try {
    await mergeZones(sourceZoneId, targetZoneId);
  } catch (error) {
    return { error: (error as Error).message };
  }

  revalidatePath("/zones");
  revalidatePath("/");
  return { error: null };
}
