"use server";

import { redirect } from "next/navigation";

import { addCityFromName } from "@/lib/cities/add";

export type AddCityActionResult = {
  error: string | null;
};

export async function addCityAction(
  _previous: AddCityActionResult | null,
  formData: FormData,
): Promise<AddCityActionResult> {
  const name = String(formData.get("name") ?? "");
  const country = String(formData.get("country") ?? "Honduras");

  let slug: string;
  try {
    const result = await addCityFromName({ name, country });
    slug = result.city.slug;
  } catch (error) {
    return { error: (error as Error).message ?? "Could not add that location." };
  }

  redirect(`/?city=${encodeURIComponent(slug)}`);
}
