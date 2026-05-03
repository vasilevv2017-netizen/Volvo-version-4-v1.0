import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names using clsx and tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts a useful value from Volvo-specific XML strings.
 * Handles doubled quotes and dynamically extracts tags/attributes.
 */
export function extractXmlInfo(xml: string): string {
  if (!xml || typeof xml !== "string") return "N/A";

  // Clean doubled quotes (common in CSV)
  const cleanXml = xml.replace(/""/g, '"');

  // 1. DataDefinition Parsing: Dynamically find the first sub-tag
  if (cleanXml.includes("DataDefinition")) {
    // Find all tags in the XML
    const tags = cleanXml.match(/<([a-zA-Z0-9]+)/g);
    if (tags) {
      // Find the first tag that is NOT 'DataDefinition'
      const typeTag = tags.find((t) => !t.toLowerCase().includes("datadefinition"));
      if (typeTag) {
        const name = typeTag.replace("<", "");
        // Pretty print common types
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      }
    }
    return "Base";
  }

  // 2. Audiences Parsing: Dynamically find all 'true' audiences
  if (cleanXml.includes("Audience")) {
    const roles: string[] = [];
    // Match any name="..." value="true" pattern
    const matches = cleanXml.matchAll(/name="([^"]+)"\s+value="true"/gi);
    for (const match of matches) {
      const role = match[1];
      // Shorten common roles
      if (role.toLowerCase() === "development") roles.push("Dev");
      else if (role.toLowerCase() === "manufacturing") roles.push("Mfg");
      else if (role.toLowerCase() === "aftermarket") roles.push("Aft");
      else roles.push(role.charAt(0).toUpperCase() + role.slice(1, 3));
    }
    return roles.length > 0 ? roles.join("/") : "Locked";
  }

  return "Object";
}
