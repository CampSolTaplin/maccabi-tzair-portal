import { createAdminClient } from '@/lib/supabase/admin';
import { queryAllSOQL } from './client';
import {
  generatePassword,
  findExistingProfileBySalesforceId,
  findSOMGroupId,
} from './sync-helpers';
import type {
  SalesforceContact,
  SyncResult,
  SyncError,
  NewUserCredential,
} from './types';

const SOM_CONTACTS_QUERY = `
  SELECT Id, FirstName, LastName, Email, MobilePhone, Phone, Birthdate,
         TREX1__Age__c, TREX1__Grade__c, School__c, Allergies__c,
         Behavorial_Issues__c, AccountId, Quattro_Family_Position__c,
         Active_Registrations__c
  FROM Contact
  WHERE SOM_Registration_Allowed__c = true
`.trim();

function buildParentQuery(accountIds: string[]): string {
  const escaped = accountIds.map((id) => `'${id}'`).join(',');
  return `
    SELECT Id, FirstName, LastName, Email, MobilePhone, Phone, AccountId,
           Quattro_Family_Position__c, TREX1__Age__c
    FROM Contact
    WHERE AccountId IN (${escaped})
      AND TREX1__Age__c > 18
      AND SOM_Registration_Allowed__c != true
  `.trim();
}

export async function runSalesforceSync(triggeredBy: string): Promise<{
  result: SyncResult;
  credentials: NewUserCredential[];
}> {
  const adminClient = createAdminClient();

  const result: SyncResult = {
    totalProcessed: 0,
    participantsCreated: 0,
    participantsUpdated: 0,
    participantsSkipped: 0,
    parentsCreated: 0,
    parentsUpdated: 0,
    parentsSkipped: 0,
    relationshipsCreated: 0,
    membershipsCreated: 0,
    errors: [],
  };
  const credentials: NewUserCredential[] = [];

  // 1. Log start
  const { data: logRow } = await adminClient
    .from('salesforce_sync_log')
    .insert({
      sync_type: 'full',
      status: 'running',
      triggered_by: triggeredBy,
    })
    .select('id')
    .single();

  const logId = logRow?.id;

  try {
    // 2-3. Query SOM contacts from Salesforce
    const somContacts = await queryAllSOQL<SalesforceContact>(SOM_CONTACTS_QUERY);
    result.totalProcessed = somContacts.length;

    // 4. Find SOM group
    const somGroupId = await findSOMGroupId(adminClient);

    // 5. Process each SOM contact
    for (const contact of somContacts) {
      try {
        const contactName = `${contact.FirstName ?? ''} ${contact.LastName}`.trim();
        const existing = await findExistingProfileBySalesforceId(adminClient, contact.Id);

        if (existing) {
          // Update existing profile
          await adminClient
            .from('profiles')
            .update({
              first_name: contact.FirstName ?? '',
              last_name: contact.LastName,
              phone: contact.MobilePhone ?? contact.Phone ?? null,
              birthdate: contact.Birthdate ?? null,
              grade: contact.TREX1__Grade__c ?? null,
              school: contact.School__c ?? null,
              allergies: contact.Allergies__c ?? null,
              behavioral_notes: contact.Behavorial_Issues__c ?? null,
              salesforce_account_id: contact.AccountId ?? null,
            })
            .eq('id', existing.id);

          result.participantsUpdated++;
        } else if (contact.Email) {
          // New contact with email: create auth user
          const tempPassword = generatePassword();
          const { data: authUser, error: authError } =
            await adminClient.auth.admin.createUser({
              email: contact.Email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: {
                role: 'participant',
                first_name: contact.FirstName ?? '',
                last_name: contact.LastName,
                salesforce_contact_id: contact.Id,
              },
            });

          if (authError) {
            throw new Error(`Auth user creation failed: ${authError.message}`);
          }

          // The handle_new_user trigger creates the profile; now update it with SF data
          await adminClient
            .from('profiles')
            .update({
              phone: contact.MobilePhone ?? contact.Phone ?? null,
              salesforce_contact_id: contact.Id,
              salesforce_account_id: contact.AccountId ?? null,
              birthdate: contact.Birthdate ?? null,
              grade: contact.TREX1__Grade__c ?? null,
              school: contact.School__c ?? null,
              allergies: contact.Allergies__c ?? null,
              behavioral_notes: contact.Behavorial_Issues__c ?? null,
              is_active: true,
            })
            .eq('id', authUser.user.id);

          // Create group membership
          const { error: membershipError } = await adminClient
            .from('group_memberships')
            .upsert(
              {
                profile_id: authUser.user.id,
                group_id: somGroupId,
                role: 'participant',
                is_active: true,
              },
              { onConflict: 'profile_id,group_id,role' }
            );

          if (!membershipError) {
            result.membershipsCreated++;
          }

          credentials.push({
            role: 'participant',
            firstName: contact.FirstName ?? '',
            lastName: contact.LastName,
            email: contact.Email,
            temporaryPassword: tempPassword,
            salesforceId: contact.Id,
          });

          result.participantsCreated++;
        } else {
          // New contact without email: create profile directly
          const newId = crypto.randomUUID();
          await adminClient.from('profiles').insert({
            id: newId,
            role: 'participant',
            first_name: contact.FirstName ?? '',
            last_name: contact.LastName,
            phone: contact.MobilePhone ?? contact.Phone ?? null,
            salesforce_contact_id: contact.Id,
            salesforce_account_id: contact.AccountId ?? null,
            birthdate: contact.Birthdate ?? null,
            grade: contact.TREX1__Grade__c ?? null,
            school: contact.School__c ?? null,
            allergies: contact.Allergies__c ?? null,
            behavioral_notes: contact.Behavorial_Issues__c ?? null,
            is_active: false,
            needs_email: true,
          });

          // Create group membership for the no-email profile too
          await adminClient.from('group_memberships').upsert(
            {
              profile_id: newId,
              group_id: somGroupId,
              role: 'participant',
              is_active: true,
            },
            { onConflict: 'profile_id,group_id,role' }
          );

          result.membershipsCreated++;
          result.participantsSkipped++;
        }
      } catch (err) {
        result.errors.push({
          contactId: contact.Id,
          contactName: `${contact.FirstName ?? ''} ${contact.LastName}`.trim(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 6. Collect unique AccountIds
    const accountIds = [
      ...new Set(
        somContacts
          .map((c) => c.AccountId)
          .filter((id): id is string => id !== null)
      ),
    ];

    // 7. Query parents in batches of 200
    const allParents: SalesforceContact[] = [];
    for (let i = 0; i < accountIds.length; i += 200) {
      const batch = accountIds.slice(i, i + 200);
      const parents = await queryAllSOQL<SalesforceContact>(buildParentQuery(batch));
      allParents.push(...parents);
    }

    // 8. Process parents
    for (const parent of allParents) {
      try {
        const existing = await findExistingProfileBySalesforceId(adminClient, parent.Id);

        if (existing) {
          // Update existing parent profile
          await adminClient
            .from('profiles')
            .update({
              first_name: parent.FirstName ?? '',
              last_name: parent.LastName,
              phone: parent.MobilePhone ?? parent.Phone ?? null,
              salesforce_account_id: parent.AccountId ?? null,
            })
            .eq('id', existing.id);

          result.parentsUpdated++;
        } else if (parent.Email) {
          // New parent with email
          const tempPassword = generatePassword();
          const { data: authUser, error: authError } =
            await adminClient.auth.admin.createUser({
              email: parent.Email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: {
                role: 'parent',
                first_name: parent.FirstName ?? '',
                last_name: parent.LastName,
                salesforce_contact_id: parent.Id,
              },
            });

          if (authError) {
            throw new Error(`Parent auth creation failed: ${authError.message}`);
          }

          await adminClient
            .from('profiles')
            .update({
              phone: parent.MobilePhone ?? parent.Phone ?? null,
              salesforce_contact_id: parent.Id,
              salesforce_account_id: parent.AccountId ?? null,
              is_active: true,
            })
            .eq('id', authUser.user.id);

          credentials.push({
            role: 'parent',
            firstName: parent.FirstName ?? '',
            lastName: parent.LastName,
            email: parent.Email,
            temporaryPassword: tempPassword,
            salesforceId: parent.Id,
          });

          result.parentsCreated++;
        } else {
          // No email, skip parent
          result.parentsSkipped++;
        }
      } catch (err) {
        result.errors.push({
          contactId: parent.Id,
          contactName: `${parent.FirstName ?? ''} ${parent.LastName}`.trim(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 9. Build parent-child relationships
    // Get all SOM participant profiles with salesforce_account_id
    const { data: participantProfiles } = await adminClient
      .from('profiles')
      .select('id, salesforce_account_id')
      .eq('role', 'participant')
      .not('salesforce_account_id', 'is', null);

    if (participantProfiles) {
      for (const participant of participantProfiles) {
        if (!participant.salesforce_account_id) continue;

        // Find parent profiles with same account ID
        const { data: parentProfiles } = await adminClient
          .from('profiles')
          .select('id')
          .eq('role', 'parent')
          .eq('salesforce_account_id', participant.salesforce_account_id);

        if (parentProfiles) {
          for (const parentProfile of parentProfiles) {
            const { error: relError } = await adminClient
              .from('parent_child')
              .upsert(
                {
                  parent_id: parentProfile.id,
                  child_id: participant.id,
                  relationship: 'parent',
                },
                { onConflict: 'parent_id,child_id' }
              );

            if (!relError) {
              result.relationshipsCreated++;
            }
          }
        }
      }
    }

    // 10. Update log with success
    if (logId) {
      await adminClient
        .from('salesforce_sync_log')
        .update({
          status: 'completed',
          records_synced: result.totalProcessed,
          records_created: result.participantsCreated + result.parentsCreated,
          records_updated: result.participantsUpdated + result.parentsUpdated,
          error_message:
            result.errors.length > 0
              ? `${result.errors.length} errors during sync`
              : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logId);
    }
  } catch (err) {
    // Fatal error: update log
    if (logId) {
      await adminClient
        .from('salesforce_sync_log')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err),
          completed_at: new Date().toISOString(),
        })
        .eq('id', logId);
    }
    throw err;
  }

  return { result, credentials };
}
