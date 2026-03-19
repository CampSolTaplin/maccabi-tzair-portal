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
  SOM_Registration_Allowed__c: boolean;
  AccountId: string | null;
  Quattro_Family_Position__c: string | null;
  Active_Registrations__c: string | null;
}

export interface SyncResult {
  totalProcessed: number;
  participantsCreated: number;
  participantsUpdated: number;
  participantsSkipped: number;
  parentsCreated: number;
  parentsUpdated: number;
  parentsSkipped: number;
  relationshipsCreated: number;
  membershipsCreated: number;
  errors: SyncError[];
}

export interface SyncError {
  contactId: string;
  contactName: string;
  error: string;
}

export interface NewUserCredential {
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  salesforceId: string;
}
