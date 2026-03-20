export interface SalesforceContact {
  Id: string;
  FirstName: string | null;
  LastName: string;
  Email: string | null;
  MobilePhone: string | null;
  Phone: string | null;
  Birthdate: string | null;
  TREX1__Age__c: number | null;
  TREX1__Grade__c: string | null;
  School__c: string | null;
  Allergies__c: string | null;
  Behavorial_Issues__c: string | null;
  Gender__c: string | null;
  AccountId: string | null;
}

export interface EnrichResult {
  totalProfiles: number;
  enrichedFromSF: number;
  parentsFound: number;
  schoolsNormalized: number;
  allergiesCleaned: number;
  errors: { contactId: string; name: string; error: string }[];
}
