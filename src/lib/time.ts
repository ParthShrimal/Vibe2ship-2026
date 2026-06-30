export function getCurrentContext() {
  const now = new Date();

  return {
    now,
    iso: now.toISOString(),
    localDate: now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    localTime: now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

export function addHours(hours: number) {
  return new Date(
    Date.now() + hours * 60 * 60 * 1000
  ).toISOString();
}