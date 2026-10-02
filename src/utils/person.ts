// Formats names the Filipino way: "Dela Cruz, Juan M." or "Juan M. Dela Cruz".

interface PersonName {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
}

function middleInitial(middleName?: string | null) {
  return middleName ? ` ${middleName.trim().charAt(0).toUpperCase()}.` : "";
}

export function fullName(person: PersonName): string {
  const suffix = person.suffix ? ` ${person.suffix}` : "";
  return `${person.firstName}${middleInitial(person.middleName)} ${person.lastName}${suffix}`;
}

export function formalName(person: PersonName): string {
  const suffix = person.suffix ? ` ${person.suffix}` : "";
  return `${person.lastName}${suffix}, ${person.firstName}${middleInitial(person.middleName)}`;
}
