
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "agent_configurations": {
                  Row: {
                    "agent": string,"allow_cross_provider_fallback": boolean,"connection_id": string | null,"effort": string,"id": string,"model": string,"monthly_budget_usd": number,"on_budget_exhausted": string,"prompt_version": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent": string,"allow_cross_provider_fallback"?: boolean,"connection_id"?: string | null,"effort"?: string,"id"?: string,"model"?: string,"monthly_budget_usd"?: number,"on_budget_exhausted"?: string,"prompt_version"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "agent"?: string,"allow_cross_provider_fallback"?: boolean,"connection_id"?: string | null,"effort"?: string,"id"?: string,"model"?: string,"monthly_budget_usd"?: number,"on_budget_exhausted"?: string,"prompt_version"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_configurations_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "provider_connections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_configurations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_executions": {
                  Row: {
                    "agent": string,"cache_read_tokens": number,"cache_write_tokens": number,"correlation_id": string | null,"cost_usd": number,"entity_id": string | null,"entity_type": string | null,"error": string | null,"finished_at": string | null,"id": string,"input_tokens": number,"model": string,"output_tokens": number,"prompt_version": string | null,"provider": string,"request_id": string | null,"started_at": string,"status": string,"triggered_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent": string,"cache_read_tokens"?: number,"cache_write_tokens"?: number,"correlation_id"?: string | null,"cost_usd"?: number,"entity_id"?: string | null,"entity_type"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input_tokens"?: number,"model": string,"output_tokens"?: number,"prompt_version"?: string | null,"provider": string,"request_id"?: string | null,"started_at"?: string,"status"?: string,"triggered_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "agent"?: string,"cache_read_tokens"?: number,"cache_write_tokens"?: number,"correlation_id"?: string | null,"cost_usd"?: number,"entity_id"?: string | null,"entity_type"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input_tokens"?: number,"model"?: string,"output_tokens"?: number,"prompt_version"?: string | null,"provider"?: string,"request_id"?: string | null,"started_at"?: string,"status"?: string,"triggered_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_executions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_events": {
                  Row: {
                    "actor_id": string | null,"actor_type": string,"approval_id": string,"content_fingerprint": string | null,"created_at": string,"detail": NonNullable<Json>,"event": string,"id": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_type": string,"approval_id": string,"content_fingerprint"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"event": string,"id"?: never,"workspace_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_type"?: string,"approval_id"?: string,"content_fingerprint"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"event"?: string,"id"?: never,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_events_approval_id_fkey"
      columns: ["approval_id"]
isOneToOne: false
      referencedRelation: "approval_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_requests": {
                  Row: {
                    "approved_action": string,"approved_at": string | null,"approved_by": string | null,"assigned_to": string | null,"batch_id": string | null,"channel": string,"content_fingerprint": string,"created_at": string,"decision_reason": string | null,"draft_id": string,"draft_version_id": string,"expires_at": string | null,"id": string,"proposed_send_at": string | null,"recipient_value": string,"sending_account_id": string | null,"snoozed_until": string | null,"status": string,"subject": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_action"?: string,"approved_at"?: string | null,"approved_by"?: string | null,"assigned_to"?: string | null,"batch_id"?: string | null,"channel": string,"content_fingerprint": string,"created_at"?: string,"decision_reason"?: string | null,"draft_id": string,"draft_version_id": string,"expires_at"?: string | null,"id"?: string,"proposed_send_at"?: string | null,"recipient_value": string,"sending_account_id"?: string | null,"snoozed_until"?: string | null,"status"?: string,"subject"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "approved_action"?: string,"approved_at"?: string | null,"approved_by"?: string | null,"assigned_to"?: string | null,"batch_id"?: string | null,"channel"?: string,"content_fingerprint"?: string,"created_at"?: string,"decision_reason"?: string | null,"draft_id"?: string,"draft_version_id"?: string,"expires_at"?: string | null,"id"?: string,"proposed_send_at"?: string | null,"recipient_value"?: string,"sending_account_id"?: string | null,"snoozed_until"?: string | null,"status"?: string,"subject"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_requests_draft_id_fkey"
      columns: ["draft_id"]
isOneToOne: false
      referencedRelation: "outreach_drafts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_draft_version_id_fkey"
      columns: ["draft_version_id"]
isOneToOne: false
      referencedRelation: "draft_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_sending_account_id_fkey"
      columns: ["sending_account_id"]
isOneToOne: false
      referencedRelation: "channel_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_type": string,"after": Json | null,"before": Json | null,"correlation_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string | null,"id": number,"metadata": NonNullable<Json>,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_type": string,"after"?: Json | null,"before"?: Json | null,"correlation_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: never,"metadata"?: NonNullable<Json>,"workspace_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_type"?: string,"after"?: Json | null,"before"?: Json | null,"correlation_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: never,"metadata"?: NonNullable<Json>,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"channel_account_secrets": {
                  Row: {
                    "account_id": string,"ciphertext": string,"key_version": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"ciphertext": string,"key_version"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"ciphertext"?: string,"key_version"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_account_secrets_account_id_fkey"
      columns: ["account_id"]
isOneToOne: true
      referencedRelation: "channel_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"channel_accounts": {
                  Row: {
                    "account_email": string | null,"channel": string,"connected_by": string | null,"created_at": string,"display_name": string | null,"history_id": string | null,"id": string,"last_error": string | null,"last_sync_at": string | null,"scopes": (string)[],"status": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_email"?: string | null,"channel": string,"connected_by"?: string | null,"created_at"?: string,"display_name"?: string | null,"history_id"?: string | null,"id"?: string,"last_error"?: string | null,"last_sync_at"?: string | null,"scopes"?: (string)[],"status"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "account_email"?: string | null,"channel"?: string,"connected_by"?: string | null,"created_at"?: string,"display_name"?: string | null,"history_id"?: string | null,"id"?: string,"last_error"?: string | null,"last_sync_at"?: string | null,"scopes"?: (string)[],"status"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_channels": {
                  Row: {
                    "bounced_at": string | null,"channel": string,"confidence": number | null,"contact_id": string | null,"created_at": string,"email_quality": string | null,"id": string,"is_primary": boolean,"organisation_id": string | null,"source": string | null,"value": string,"verification_method": string | null,"verification_status": string,"verified_at": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bounced_at"?: string | null,"channel": string,"confidence"?: number | null,"contact_id"?: string | null,"created_at"?: string,"email_quality"?: string | null,"id"?: string,"is_primary"?: boolean,"organisation_id"?: string | null,"source"?: string | null,"value": string,"verification_method"?: string | null,"verification_status"?: string,"verified_at"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "bounced_at"?: string | null,"channel"?: string,"confidence"?: number | null,"contact_id"?: string | null,"created_at"?: string,"email_quality"?: string | null,"id"?: string,"is_primary"?: boolean,"organisation_id"?: string | null,"source"?: string | null,"value"?: string,"verification_method"?: string | null,"verification_status"?: string,"verified_at"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_channels_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_channels_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_channels_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_organisations": {
                  Row: {
                    "buyer_relevance": number | null,"contact_id": string,"created_at": string,"is_current": boolean,"organisation_id": string,"role_category": string | null,"source": string | null,"title": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_relevance"?: number | null,"contact_id": string,"created_at"?: string,"is_current"?: boolean,"organisation_id": string,"role_category"?: string | null,"source"?: string | null,"title"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "buyer_relevance"?: number | null,"contact_id"?: string,"created_at"?: string,"is_current"?: boolean,"organisation_id"?: string,"role_category"?: string | null,"source"?: string | null,"title"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_organisations_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_organisations_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_organisations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"first_name": string | null,"full_name": string,"id": string,"is_demo": boolean,"last_interaction_at": string | null,"last_name": string | null,"lawful_basis": string,"linkedin_url": string | null,"location": string | null,"market": string | null,"normalised_name": string,"notes": string | null,"opted_out_at": string | null,"outreach_status": string,"owner_user_id": string | null,"subscriber_type": string,"updated_at": string,"verification_status": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"first_name"?: string | null,"full_name": string,"id"?: string,"is_demo"?: boolean,"last_interaction_at"?: string | null,"last_name"?: string | null,"lawful_basis"?: string,"linkedin_url"?: string | null,"location"?: string | null,"market"?: string | null,"normalised_name": string,"notes"?: string | null,"opted_out_at"?: string | null,"outreach_status"?: string,"owner_user_id"?: string | null,"subscriber_type"?: string,"updated_at"?: string,"verification_status"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"first_name"?: string | null,"full_name"?: string,"id"?: string,"is_demo"?: boolean,"last_interaction_at"?: string | null,"last_name"?: string | null,"lawful_basis"?: string,"linkedin_url"?: string | null,"location"?: string | null,"market"?: string | null,"normalised_name"?: string,"notes"?: string | null,"opted_out_at"?: string | null,"outreach_status"?: string,"owner_user_id"?: string | null,"subscriber_type"?: string,"updated_at"?: string,"verification_status"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_classifications": {
                  Row: {
                    "agent_execution_id": string | null,"confidence": number | null,"conversation_message_id": string,"created_at": string,"final": string | null,"id": string,"proposed": string,"rationale": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_execution_id"?: string | null,"confidence"?: number | null,"conversation_message_id": string,"created_at"?: string,"final"?: string | null,"id"?: string,"proposed": string,"rationale"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "agent_execution_id"?: string | null,"confidence"?: number | null,"conversation_message_id"?: string,"created_at"?: string,"final"?: string | null,"id"?: string,"proposed"?: string,"rationale"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_classifications_agent_execution_id_fkey"
      columns: ["agent_execution_id"]
isOneToOne: false
      referencedRelation: "agent_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_classifications_conversation_message_id_fkey"
      columns: ["conversation_message_id"]
isOneToOne: false
      referencedRelation: "conversation_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_classifications_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_events": {
                  Row: {
                    "actor_id": string | null,"actor_type": string,"conversation_id": string,"created_at": string,"from_status": string | null,"id": number,"note": string | null,"to_status": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_type": string,"conversation_id": string,"created_at"?: string,"from_status"?: string | null,"id"?: never,"note"?: string | null,"to_status": string,"workspace_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_type"?: string,"conversation_id"?: string,"created_at"?: string,"from_status"?: string | null,"id"?: never,"note"?: string | null,"to_status"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_events_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_messages": {
                  Row: {
                    "body_text": string | null,"conversation_id": string,"created_at": string,"direction": string,"from_value": string | null,"id": string,"is_demo": boolean,"occurred_at": string,"outbound_message_id": string | null,"provider_message_id": string | null,"snippet": string | null,"source": string,"subject": string | null,"to_value": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body_text"?: string | null,"conversation_id": string,"created_at"?: string,"direction": string,"from_value"?: string | null,"id"?: string,"is_demo"?: boolean,"occurred_at": string,"outbound_message_id"?: string | null,"provider_message_id"?: string | null,"snippet"?: string | null,"source": string,"subject"?: string | null,"to_value"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "body_text"?: string | null,"conversation_id"?: string,"created_at"?: string,"direction"?: string,"from_value"?: string | null,"id"?: string,"is_demo"?: boolean,"occurred_at"?: string,"outbound_message_id"?: string | null,"provider_message_id"?: string | null,"snippet"?: string | null,"source"?: string,"subject"?: string | null,"to_value"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_messages_outbound_message_id_fkey"
      columns: ["outbound_message_id"]
isOneToOne: false
      referencedRelation: "outbound_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_messages_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "channel": string,"channel_account_id": string | null,"contact_id": string | null,"created_at": string,"id": string,"is_demo": boolean,"last_inbound_at": string | null,"last_outbound_at": string | null,"latest_classification": string | null,"market": string | null,"needs_review": boolean,"organisation_id": string | null,"provider_thread_id": string | null,"status": string,"subject": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"channel_account_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"last_inbound_at"?: string | null,"last_outbound_at"?: string | null,"latest_classification"?: string | null,"market"?: string | null,"needs_review"?: boolean,"organisation_id"?: string | null,"provider_thread_id"?: string | null,"status"?: string,"subject"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "channel"?: string,"channel_account_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"last_inbound_at"?: string | null,"last_outbound_at"?: string | null,"latest_classification"?: string | null,"market"?: string | null,"needs_review"?: boolean,"organisation_id"?: string | null,"provider_thread_id"?: string | null,"status"?: string,"subject"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_channel_account_id_fkey"
      columns: ["channel_account_id"]
isOneToOne: false
      referencedRelation: "channel_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"data_sources": {
                  Row: {
                    "created_at": string,"id": string,"is_enabled": boolean,"key": string,"kind": string,"licence_notes": string | null,"name": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_enabled"?: boolean,"key": string,"kind": string,"licence_notes"?: string | null,"name": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_enabled"?: boolean,"key"?: string,"kind"?: string,"licence_notes"?: string | null,"name"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_sources_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"draft_versions": {
                  Row: {
                    "agent_execution_id": string | null,"body": string,"channel": string,"created_at": string,"created_by": string | null,"draft_id": string,"fingerprint": string | null,"id": string,"quality": NonNullable<Json>,"recipient_channel_id": string | null,"recipient_value": string,"refine_action": string | null,"sending_account_id": string | null,"source": string,"strategic_angle": string | null,"subject": string | null,"supporting_evidence_ids": (string)[],"version_no": number,"voice_version_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_execution_id"?: string | null,"body": string,"channel": string,"created_at"?: string,"created_by"?: string | null,"draft_id": string,"fingerprint"?: never,"id"?: string,"quality"?: NonNullable<Json>,"recipient_channel_id"?: string | null,"recipient_value": string,"refine_action"?: string | null,"sending_account_id"?: string | null,"source": string,"strategic_angle"?: string | null,"subject"?: string | null,"supporting_evidence_ids"?: (string)[],"version_no": number,"voice_version_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "agent_execution_id"?: string | null,"body"?: string,"channel"?: string,"created_at"?: string,"created_by"?: string | null,"draft_id"?: string,"fingerprint"?: never,"id"?: string,"quality"?: NonNullable<Json>,"recipient_channel_id"?: string | null,"recipient_value"?: string,"refine_action"?: string | null,"sending_account_id"?: string | null,"source"?: string,"strategic_angle"?: string | null,"subject"?: string | null,"supporting_evidence_ids"?: (string)[],"version_no"?: number,"voice_version_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "draft_versions_agent_execution_id_fkey"
      columns: ["agent_execution_id"]
isOneToOne: false
      referencedRelation: "agent_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "draft_versions_draft_id_fkey"
      columns: ["draft_id"]
isOneToOne: false
      referencedRelation: "outreach_drafts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "draft_versions_recipient_channel_id_fkey"
      columns: ["recipient_channel_id"]
isOneToOne: false
      referencedRelation: "contact_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "draft_versions_sending_account_id_fkey"
      columns: ["sending_account_id"]
isOneToOne: false
      referencedRelation: "channel_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "draft_versions_voice_version_id_fkey"
      columns: ["voice_version_id"]
isOneToOne: false
      referencedRelation: "voice_profile_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "draft_versions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"entity_resolution_matches": {
                  Row: {
                    "candidate_ref": string,"created_at": string,"decided_by": string | null,"decision": string,"entity_type": string,"id": string,"matched_id": string | null,"score": number,"signals": NonNullable<Json>,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_ref": string,"created_at"?: string,"decided_by"?: string | null,"decision"?: string,"entity_type": string,"id"?: string,"matched_id"?: string | null,"score": number,"signals": NonNullable<Json>,"workspace_id": string
                  }
                  Update: {
                    "candidate_ref"?: string,"created_at"?: string,"decided_by"?: string | null,"decision"?: string,"entity_type"?: string,"id"?: string,"matched_id"?: string | null,"score"?: number,"signals"?: NonNullable<Json>,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entity_resolution_matches_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"evidence_items": {
                  Row: {
                    "agent_execution_id": string | null,"claim_field": string,"claim_text": string,"confidence": number,"contact_id": string | null,"created_at": string,"created_by": string | null,"created_by_type": string,"excerpt": string | null,"fact_type": string,"id": string,"is_adverse": boolean,"is_demo": boolean,"licence_notes": string | null,"organisation_id": string | null,"published_at": string | null,"retrieved_at": string,"review_by": string | null,"source_name": string,"source_record_id": string | null,"source_url": string | null,"status": string,"superseded_by": string | null,"value_as_of": string | null,"value_currency": string | null,"value_numeric": number | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_execution_id"?: string | null,"claim_field": string,"claim_text": string,"confidence": number,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"created_by_type"?: string,"excerpt"?: string | null,"fact_type": string,"id"?: string,"is_adverse"?: boolean,"is_demo"?: boolean,"licence_notes"?: string | null,"organisation_id"?: string | null,"published_at"?: string | null,"retrieved_at"?: string,"review_by"?: string | null,"source_name": string,"source_record_id"?: string | null,"source_url"?: string | null,"status"?: string,"superseded_by"?: string | null,"value_as_of"?: string | null,"value_currency"?: string | null,"value_numeric"?: number | null,"workspace_id": string
                  }
                  Update: {
                    "agent_execution_id"?: string | null,"claim_field"?: string,"claim_text"?: string,"confidence"?: number,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"created_by_type"?: string,"excerpt"?: string | null,"fact_type"?: string,"id"?: string,"is_adverse"?: boolean,"is_demo"?: boolean,"licence_notes"?: string | null,"organisation_id"?: string | null,"published_at"?: string | null,"retrieved_at"?: string,"review_by"?: string | null,"source_name"?: string,"source_record_id"?: string | null,"source_url"?: string | null,"status"?: string,"superseded_by"?: string | null,"value_as_of"?: string | null,"value_currency"?: string | null,"value_numeric"?: number | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_contact_fk"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_agent_execution_id_fkey"
      columns: ["agent_execution_id"]
isOneToOne: false
      referencedRelation: "agent_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_source_record_id_fkey"
      columns: ["source_record_id"]
isOneToOne: false
      referencedRelation: "source_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_superseded_by_fkey"
      columns: ["superseded_by"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"icps": {
                  Row: {
                    "created_at": string,"definition": NonNullable<Json>,"id": string,"is_active": boolean,"market": string | null,"min_score": number,"name": string,"version_no": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"definition": NonNullable<Json>,"id"?: string,"is_active"?: boolean,"market"?: string | null,"min_score"?: number,"name": string,"version_no"?: number,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"definition"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"market"?: string | null,"min_score"?: number,"name"?: string,"version_no"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "icps_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"import_batches": {
                  Row: {
                    "committed_at": string | null,"created_at": string,"created_by": string | null,"error": string | null,"file_name": string,"file_path": string | null,"id": string,"mapping": Json | null,"reverted_at": string | null,"sheet_name": string | null,"stats": NonNullable<Json>,"status": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "committed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"file_name": string,"file_path"?: string | null,"id"?: string,"mapping"?: Json | null,"reverted_at"?: string | null,"sheet_name"?: string | null,"stats"?: NonNullable<Json>,"status"?: string,"workspace_id": string
                  }
                  Update: {
                    "committed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"file_name"?: string,"file_path"?: string | null,"id"?: string,"mapping"?: Json | null,"reverted_at"?: string | null,"sheet_name"?: string | null,"stats"?: NonNullable<Json>,"status"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_batches_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"import_rows": {
                  Row: {
                    "action": string | null,"batch_id": string,"contact_id": string | null,"created_entities": NonNullable<Json>,"errors": NonNullable<Json>,"id": string,"normalised": Json | null,"organisation_id": string | null,"raw": NonNullable<Json>,"row_number": number,"status": string,"warnings": NonNullable<Json>,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: string | null,"batch_id": string,"contact_id"?: string | null,"created_entities"?: NonNullable<Json>,"errors"?: NonNullable<Json>,"id"?: string,"normalised"?: Json | null,"organisation_id"?: string | null,"raw": NonNullable<Json>,"row_number": number,"status"?: string,"warnings"?: NonNullable<Json>,"workspace_id": string
                  }
                  Update: {
                    "action"?: string | null,"batch_id"?: string,"contact_id"?: string | null,"created_entities"?: NonNullable<Json>,"errors"?: NonNullable<Json>,"id"?: string,"normalised"?: Json | null,"organisation_id"?: string | null,"raw"?: NonNullable<Json>,"row_number"?: number,"status"?: string,"warnings"?: NonNullable<Json>,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_rows_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"insights": {
                  Row: {
                    "agent_execution_id": string | null,"body": NonNullable<Json>,"conclusion": string,"created_at": string,"created_by": string | null,"id": string,"question": string | null,"status": string,"task_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_execution_id"?: string | null,"body"?: NonNullable<Json>,"conclusion": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"question"?: string | null,"status"?: string,"task_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "agent_execution_id"?: string | null,"body"?: NonNullable<Json>,"conclusion"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"question"?: string | null,"status"?: string,"task_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "insights_agent_execution_id_fkey"
      columns: ["agent_execution_id"]
isOneToOne: false
      referencedRelation: "agent_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "insights_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "insights_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_events": {
                  Row: {
                    "created_at": string,"detail": NonNullable<Json>,"event": string,"id": number,"integration": string,"status": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"event": string,"id"?: never,"integration": string,"status": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"event"?: string,"id"?: never,"integration"?: string,"status"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "attempts": number,"correlation_id": string,"cost_usd": number,"created_at": string,"created_by": string | null,"finished_at": string | null,"id": string,"idempotency_key": string | null,"last_error": string | null,"locked_at": string | null,"locked_by": string | null,"max_attempts": number,"payload": NonNullable<Json>,"result": Json | null,"run_after": string,"status": string,"timeout_seconds": number,"type": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"correlation_id"?: string,"cost_usd"?: number,"created_at"?: string,"created_by"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"last_error"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"result"?: Json | null,"run_after"?: string,"status"?: string,"timeout_seconds"?: number,"type": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "attempts"?: number,"correlation_id"?: string,"cost_usd"?: number,"created_at"?: string,"created_by"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"last_error"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"result"?: Json | null,"run_after"?: string,"status"?: string,"timeout_seconds"?: number,"type"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_qualifications": {
                  Row: {
                    "affordability": string,"affordability_reasons": NonNullable<Json>,"agent_execution_id": string | null,"band": string,"commercial_value_amount": number | null,"commercial_value_currency": string | null,"coverage": number,"created_at": string,"created_by": string | null,"critical_unknowns": NonNullable<Json>,"engagement_propensity": string,"evidence_confidence": number,"explanation": NonNullable<Json>,"icp_id": string | null,"id": string,"is_current": boolean,"organisation_id": string,"overridden_at": string | null,"overridden_by": string | null,"override_reason": string | null,"override_score": number | null,"propensity_is_calibrated": boolean,"score": number,"scoring_model_id": string,"version_no": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "affordability"?: string,"affordability_reasons"?: NonNullable<Json>,"agent_execution_id"?: string | null,"band": string,"commercial_value_amount"?: number | null,"commercial_value_currency"?: string | null,"coverage": number,"created_at"?: string,"created_by"?: string | null,"critical_unknowns"?: NonNullable<Json>,"engagement_propensity"?: string,"evidence_confidence": number,"explanation"?: NonNullable<Json>,"icp_id"?: string | null,"id"?: string,"is_current"?: boolean,"organisation_id": string,"overridden_at"?: string | null,"overridden_by"?: string | null,"override_reason"?: string | null,"override_score"?: number | null,"propensity_is_calibrated"?: boolean,"score": number,"scoring_model_id": string,"version_no": number,"workspace_id": string
                  }
                  Update: {
                    "affordability"?: string,"affordability_reasons"?: NonNullable<Json>,"agent_execution_id"?: string | null,"band"?: string,"commercial_value_amount"?: number | null,"commercial_value_currency"?: string | null,"coverage"?: number,"created_at"?: string,"created_by"?: string | null,"critical_unknowns"?: NonNullable<Json>,"engagement_propensity"?: string,"evidence_confidence"?: number,"explanation"?: NonNullable<Json>,"icp_id"?: string | null,"id"?: string,"is_current"?: boolean,"organisation_id"?: string,"overridden_at"?: string | null,"overridden_by"?: string | null,"override_reason"?: string | null,"override_score"?: number | null,"propensity_is_calibrated"?: boolean,"score"?: number,"scoring_model_id"?: string,"version_no"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_qualifications_agent_execution_id_fkey"
      columns: ["agent_execution_id"]
isOneToOne: false
      referencedRelation: "agent_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_qualifications_icp_id_fkey"
      columns: ["icp_id"]
isOneToOne: false
      referencedRelation: "icps"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_qualifications_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_qualifications_scoring_model_id_fkey"
      columns: ["scoring_model_id"]
isOneToOne: false
      referencedRelation: "scoring_models"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_qualifications_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"manual_channel_events": {
                  Row: {
                    "approval_id": string | null,"body": string | null,"channel": string,"confirmed_by": string | null,"contact_id": string | null,"conversation_id": string | null,"created_at": string,"event": string,"id": string,"occurred_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_id"?: string | null,"body"?: string | null,"channel": string,"confirmed_by"?: string | null,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"event": string,"id"?: string,"occurred_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "approval_id"?: string | null,"body"?: string | null,"channel"?: string,"confirmed_by"?: string | null,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"event"?: string,"id"?: string,"occurred_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "manual_channel_events_approval_id_fkey"
      columns: ["approval_id"]
isOneToOne: false
      referencedRelation: "approval_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "manual_channel_events_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "manual_channel_events_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "manual_channel_events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"meetings": {
                  Row: {
                    "contact_id": string | null,"conversation_id": string | null,"created_at": string,"id": string,"is_demo": boolean,"notes": string | null,"opportunity_id": string | null,"organisation_id": string | null,"prep_brief": string | null,"scheduled_at": string | null,"status": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"notes"?: string | null,"opportunity_id"?: string | null,"organisation_id"?: string | null,"prep_brief"?: string | null,"scheduled_at"?: string | null,"status"?: string,"workspace_id": string
                  }
                  Update: {
                    "contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"notes"?: string | null,"opportunity_id"?: string | null,"organisation_id"?: string | null,"prep_brief"?: string | null,"scheduled_at"?: string | null,"status"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meetings_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notes": {
                  Row: {
                    "body": string,"contact_id": string | null,"conversation_id": string | null,"created_at": string,"created_by": string | null,"id": string,"organisation_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organisation_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "body"?: string,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organisation_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notes_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notes_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunities": {
                  Row: {
                    "actual_value_amount": number | null,"closed_at": string | null,"contact_id": string | null,"conversation_id": string | null,"created_at": string,"currency": string,"discovery_notes": string | null,"expected_close_on": string | null,"id": string,"is_demo": boolean,"lead_source": string | null,"market": string,"name": string,"next_action": string | null,"next_action_due": string | null,"organisation_id": string,"owner_user_id": string | null,"probability_pct": number | null,"reason_lost": string | null,"service": string | null,"stage": string,"updated_at": string,"value_amount": number | null,"value_basis": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_value_amount"?: number | null,"closed_at"?: string | null,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"currency": string,"discovery_notes"?: string | null,"expected_close_on"?: string | null,"id"?: string,"is_demo"?: boolean,"lead_source"?: string | null,"market": string,"name": string,"next_action"?: string | null,"next_action_due"?: string | null,"organisation_id": string,"owner_user_id"?: string | null,"probability_pct"?: number | null,"reason_lost"?: string | null,"service"?: string | null,"stage"?: string,"updated_at"?: string,"value_amount"?: number | null,"value_basis"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "actual_value_amount"?: number | null,"closed_at"?: string | null,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"currency"?: string,"discovery_notes"?: string | null,"expected_close_on"?: string | null,"id"?: string,"is_demo"?: boolean,"lead_source"?: string | null,"market"?: string,"name"?: string,"next_action"?: string | null,"next_action_due"?: string | null,"organisation_id"?: string,"owner_user_id"?: string | null,"probability_pct"?: number | null,"reason_lost"?: string | null,"service"?: string | null,"stage"?: string,"updated_at"?: string,"value_amount"?: number | null,"value_basis"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunities_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunities_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunities_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunities_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunity_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"from_stage": string | null,"id": number,"opportunity_id": string,"to_stage": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"from_stage"?: string | null,"id"?: never,"opportunity_id": string,"to_stage": string,"workspace_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"from_stage"?: string | null,"id"?: never,"opportunity_id"?: string,"to_stage"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunity_events_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunity_events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation_aliases": {
                  Row: {
                    "alias": string,"created_at": string,"id": string,"kind": string,"normalised_alias": string,"organisation_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alias": string,"created_at"?: string,"id"?: string,"kind"?: string,"normalised_alias": string,"organisation_id": string,"workspace_id": string
                  }
                  Update: {
                    "alias"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"normalised_alias"?: string,"organisation_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisation_aliases_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_aliases_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation_brands": {
                  Row: {
                    "category": string | null,"created_at": string,"evidence_id": string | null,"id": string,"markets": (string)[],"name": string,"organisation_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"evidence_id"?: string | null,"id"?: string,"markets"?: (string)[],"name": string,"organisation_id": string,"workspace_id": string
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"evidence_id"?: string | null,"id"?: string,"markets"?: (string)[],"name"?: string,"organisation_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisation_brands_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_brands_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_brands_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation_financials": {
                  Row: {
                    "amount": number | null,"created_at": string,"currency": string | null,"evidence_id": string | null,"fact_type": string,"id": string,"market": string,"metric": string,"notes": string | null,"organisation_id": string,"period_end": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"currency"?: string | null,"evidence_id"?: string | null,"fact_type": string,"id"?: string,"market": string,"metric": string,"notes"?: string | null,"organisation_id": string,"period_end"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"currency"?: string | null,"evidence_id"?: string | null,"fact_type"?: string,"id"?: string,"market"?: string,"metric"?: string,"notes"?: string | null,"organisation_id"?: string,"period_end"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisation_financials_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_financials_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_financials_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation_market_profiles": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"local_entity_name": string | null,"local_registration_number": string | null,"market": string,"notes": string | null,"organisation_id": string,"presence": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency": string,"id"?: string,"local_entity_name"?: string | null,"local_registration_number"?: string | null,"market": string,"notes"?: string | null,"organisation_id": string,"presence"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"local_entity_name"?: string | null,"local_registration_number"?: string | null,"market"?: string,"notes"?: string | null,"organisation_id"?: string,"presence"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisation_market_profiles_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_market_profiles_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation_news": {
                  Row: {
                    "advisory_implication": string | null,"commercial_relevance": string | null,"created_at": string,"evidence_id": string | null,"headline": string,"id": string,"is_press_release": boolean,"organisation_id": string,"published_at": string,"publisher": string,"summary": string | null,"syndication_group": string | null,"url": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "advisory_implication"?: string | null,"commercial_relevance"?: string | null,"created_at"?: string,"evidence_id"?: string | null,"headline": string,"id"?: string,"is_press_release"?: boolean,"organisation_id": string,"published_at": string,"publisher": string,"summary"?: string | null,"syndication_group"?: string | null,"url": string,"workspace_id": string
                  }
                  Update: {
                    "advisory_implication"?: string | null,"commercial_relevance"?: string | null,"created_at"?: string,"evidence_id"?: string | null,"headline"?: string,"id"?: string,"is_press_release"?: boolean,"organisation_id"?: string,"published_at"?: string,"publisher"?: string,"summary"?: string | null,"syndication_group"?: string | null,"url"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisation_news_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_news_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_news_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation_risk_flags": {
                  Row: {
                    "created_at": string,"evidence_id": string | null,"id": string,"kind": string,"organisation_id": string,"reviewed_at": string | null,"reviewed_by": string | null,"severity": string,"status": string,"summary": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"evidence_id"?: string | null,"id"?: string,"kind": string,"organisation_id": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"severity": string,"status"?: string,"summary": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"evidence_id"?: string | null,"id"?: string,"kind"?: string,"organisation_id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"severity"?: string,"status"?: string,"summary"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisation_risk_flags_evidence_id_fkey"
      columns: ["evidence_id"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_risk_flags_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisation_risk_flags_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"organisations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"description": string | null,"employee_count": number | null,"employee_count_as_of": string | null,"employee_count_source": string | null,"headquarters": string | null,"id": string,"incorporation_date": string | null,"is_demo": boolean,"legal_name": string | null,"needs": (string)[],"normalised_name": string,"operating_status": string,"owner_user_id": string | null,"ownership_notes": string | null,"parent_organisation_id": string | null,"primary_domain": string | null,"primary_market": string,"registration_jurisdiction": string | null,"registration_number": string | null,"relationship_status": string,"sector": string | null,"sub_sector": string | null,"trading_name": string,"updated_at": string,"website": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"employee_count"?: number | null,"employee_count_as_of"?: string | null,"employee_count_source"?: string | null,"headquarters"?: string | null,"id"?: string,"incorporation_date"?: string | null,"is_demo"?: boolean,"legal_name"?: string | null,"needs"?: (string)[],"normalised_name": string,"operating_status"?: string,"owner_user_id"?: string | null,"ownership_notes"?: string | null,"parent_organisation_id"?: string | null,"primary_domain"?: string | null,"primary_market": string,"registration_jurisdiction"?: string | null,"registration_number"?: string | null,"relationship_status"?: string,"sector"?: string | null,"sub_sector"?: string | null,"trading_name": string,"updated_at"?: string,"website"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"employee_count"?: number | null,"employee_count_as_of"?: string | null,"employee_count_source"?: string | null,"headquarters"?: string | null,"id"?: string,"incorporation_date"?: string | null,"is_demo"?: boolean,"legal_name"?: string | null,"needs"?: (string)[],"normalised_name"?: string,"operating_status"?: string,"owner_user_id"?: string | null,"ownership_notes"?: string | null,"parent_organisation_id"?: string | null,"primary_domain"?: string | null,"primary_market"?: string,"registration_jurisdiction"?: string | null,"registration_number"?: string | null,"relationship_status"?: string,"sector"?: string | null,"sub_sector"?: string | null,"trading_name"?: string,"updated_at"?: string,"website"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organisations_parent_organisation_id_fkey"
      columns: ["parent_organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organisations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"outbound_messages": {
                  Row: {
                    "approval_id": string | null,"body": string,"channel": string,"contact_id": string | null,"conversation_id": string | null,"created_at": string,"delivery_status": string,"draft_version_id": string | null,"id": string,"is_demo": boolean,"market": string | null,"organisation_id": string | null,"provider_message_id": string | null,"provider_thread_id": string | null,"recipient_value": string,"sent_at": string,"subject": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_id"?: string | null,"body": string,"channel": string,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"delivery_status": string,"draft_version_id"?: string | null,"id"?: string,"is_demo"?: boolean,"market"?: string | null,"organisation_id"?: string | null,"provider_message_id"?: string | null,"provider_thread_id"?: string | null,"recipient_value": string,"sent_at"?: string,"subject"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "approval_id"?: string | null,"body"?: string,"channel"?: string,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"delivery_status"?: string,"draft_version_id"?: string | null,"id"?: string,"is_demo"?: boolean,"market"?: string | null,"organisation_id"?: string | null,"provider_message_id"?: string | null,"provider_thread_id"?: string | null,"recipient_value"?: string,"sent_at"?: string,"subject"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outbound_messages_approval_id_fkey"
      columns: ["approval_id"]
isOneToOne: true
      referencedRelation: "approval_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbound_messages_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbound_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbound_messages_draft_version_id_fkey"
      columns: ["draft_version_id"]
isOneToOne: false
      referencedRelation: "draft_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbound_messages_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbound_messages_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"outreach_drafts": {
                  Row: {
                    "channel": string,"contact_id": string | null,"conversation_id": string | null,"created_at": string,"created_by": string | null,"current_version_id": string | null,"id": string,"is_demo": boolean,"kind": string,"organisation_id": string,"provider_draft_id": string | null,"provider_draft_synced_version_id": string | null,"status": string,"strategy_id": string | null,"suggested_follow_up_on": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_version_id"?: string | null,"id"?: string,"is_demo"?: boolean,"kind"?: string,"organisation_id": string,"provider_draft_id"?: string | null,"provider_draft_synced_version_id"?: string | null,"status"?: string,"strategy_id"?: string | null,"suggested_follow_up_on"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "channel"?: string,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_version_id"?: string | null,"id"?: string,"is_demo"?: boolean,"kind"?: string,"organisation_id"?: string,"provider_draft_id"?: string | null,"provider_draft_synced_version_id"?: string | null,"status"?: string,"strategy_id"?: string | null,"suggested_follow_up_on"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "od_current_version_fk"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "draft_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_drafts_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_drafts_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_drafts_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_drafts_strategy_id_fkey"
      columns: ["strategy_id"]
isOneToOne: false
      referencedRelation: "outreach_strategies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_drafts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"outreach_strategies": {
                  Row: {
                    "advisory_readiness": string | null,"agent_execution_id": string | null,"communication_objective": string | null,"created_at": string,"created_by": string | null,"decision": string,"evidence_ids": (string)[],"id": string,"organisation_id": string,"qualification_id": string | null,"reasoning": NonNullable<Json>,"recommended_channel": string | null,"recommended_contact_id": string | null,"service_offering": string | null,"strategic_problem": string | null,"timing_rationale": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "advisory_readiness"?: string | null,"agent_execution_id"?: string | null,"communication_objective"?: string | null,"created_at"?: string,"created_by"?: string | null,"decision": string,"evidence_ids"?: (string)[],"id"?: string,"organisation_id": string,"qualification_id"?: string | null,"reasoning"?: NonNullable<Json>,"recommended_channel"?: string | null,"recommended_contact_id"?: string | null,"service_offering"?: string | null,"strategic_problem"?: string | null,"timing_rationale"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "advisory_readiness"?: string | null,"agent_execution_id"?: string | null,"communication_objective"?: string | null,"created_at"?: string,"created_by"?: string | null,"decision"?: string,"evidence_ids"?: (string)[],"id"?: string,"organisation_id"?: string,"qualification_id"?: string | null,"reasoning"?: NonNullable<Json>,"recommended_channel"?: string | null,"recommended_contact_id"?: string | null,"service_offering"?: string | null,"strategic_problem"?: string | null,"timing_rationale"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outreach_strategies_agent_execution_id_fkey"
      columns: ["agent_execution_id"]
isOneToOne: false
      referencedRelation: "agent_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_strategies_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_strategies_qualification_id_fkey"
      columns: ["qualification_id"]
isOneToOne: false
      referencedRelation: "lead_qualifications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_strategies_recommended_contact_id_fkey"
      columns: ["recommended_contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_strategies_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_connections": {
                  Row: {
                    "anthropic_workspace_id": string | null,"base_url": string | null,"created_at": string,"created_by": string | null,"id": string,"is_enabled": boolean,"key_hint": string | null,"label": string,"last_test_result": Json | null,"last_tested_at": string | null,"provider": string,"rotated_at": string | null,"status": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anthropic_workspace_id"?: string | null,"base_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_enabled"?: boolean,"key_hint"?: string | null,"label": string,"last_test_result"?: Json | null,"last_tested_at"?: string | null,"provider": string,"rotated_at"?: string | null,"status"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "anthropic_workspace_id"?: string | null,"base_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_enabled"?: boolean,"key_hint"?: string | null,"label"?: string,"last_test_result"?: Json | null,"last_tested_at"?: string | null,"provider"?: string,"rotated_at"?: string | null,"status"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_connections_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_secrets": {
                  Row: {
                    "ciphertext": string,"connection_id": string,"created_at": string,"key_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ciphertext": string,"connection_id": string,"created_at"?: string,"key_version"?: number
                  }
                  Update: {
                    "ciphertext"?: string,"connection_id"?: string,"created_at"?: string,"key_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_secrets_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: true
      referencedRelation: "provider_connections"
      referencedColumns: ["id"]
    }
                  ]
                },"qualification_dimensions": {
                  Row: {
                    "confidence": number | null,"contribution": number | null,"dimension": string,"evidence_ids": (string)[],"freshness_factor": number,"id": string,"qualification_id": string,"rationale": string | null,"raw_score": number | null,"weight": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence"?: number | null,"contribution"?: number | null,"dimension": string,"evidence_ids"?: (string)[],"freshness_factor"?: number,"id"?: string,"qualification_id": string,"rationale"?: string | null,"raw_score"?: number | null,"weight": number,"workspace_id": string
                  }
                  Update: {
                    "confidence"?: number | null,"contribution"?: number | null,"dimension"?: string,"evidence_ids"?: (string)[],"freshness_factor"?: number,"id"?: string,"qualification_id"?: string,"rationale"?: string | null,"raw_score"?: number | null,"weight"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qualification_dimensions_qualification_id_fkey"
      columns: ["qualification_id"]
isOneToOne: false
      referencedRelation: "lead_qualifications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "qualification_dimensions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"scoring_models": {
                  Row: {
                    "bands": NonNullable<Json>,"created_at": string,"created_by": string | null,"freshness_half_life_days": number,"id": string,"is_active": boolean,"notes": string | null,"qualified_threshold": number,"version_no": number,"weights": NonNullable<Json>,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bands"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"freshness_half_life_days"?: number,"id"?: string,"is_active"?: boolean,"notes"?: string | null,"qualified_threshold"?: number,"version_no": number,"weights": NonNullable<Json>,"workspace_id": string
                  }
                  Update: {
                    "bands"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"freshness_half_life_days"?: number,"id"?: string,"is_active"?: boolean,"notes"?: string | null,"qualified_threshold"?: number,"version_no"?: number,"weights"?: NonNullable<Json>,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scoring_models_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"send_attempts": {
                  Row: {
                    "attempt_no": number,"created_at": string,"error": string | null,"http_status": number | null,"id": number,"outcome": string,"send_job_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_no": number,"created_at"?: string,"error"?: string | null,"http_status"?: number | null,"id"?: never,"outcome": string,"send_job_id": string,"workspace_id": string
                  }
                  Update: {
                    "attempt_no"?: number,"created_at"?: string,"error"?: string | null,"http_status"?: number | null,"id"?: never,"outcome"?: string,"send_job_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "send_attempts_send_job_id_fkey"
      columns: ["send_job_id"]
isOneToOne: false
      referencedRelation: "send_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "send_attempts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"send_jobs": {
                  Row: {
                    "approval_id": string,"attempts": number,"correlation_id": string,"created_at": string,"id": string,"last_error": string | null,"provider_response": Json | null,"status": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_id": string,"attempts"?: number,"correlation_id"?: string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"provider_response"?: Json | null,"status"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "approval_id"?: string,"attempts"?: number,"correlation_id"?: string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"provider_response"?: Json | null,"status"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "send_jobs_approval_id_fkey"
      columns: ["approval_id"]
isOneToOne: true
      referencedRelation: "approval_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "send_jobs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"source_records": {
                  Row: {
                    "content_hash": string | null,"created_at": string,"data_source_id": string,"external_id": string | null,"id": string,"published_at": string | null,"raw_metadata": NonNullable<Json>,"retrieved_at": string,"title": string | null,"url": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash"?: string | null,"created_at"?: string,"data_source_id": string,"external_id"?: string | null,"id"?: string,"published_at"?: string | null,"raw_metadata"?: NonNullable<Json>,"retrieved_at"?: string,"title"?: string | null,"url"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "content_hash"?: string | null,"created_at"?: string,"data_source_id"?: string,"external_id"?: string | null,"id"?: string,"published_at"?: string | null,"raw_metadata"?: NonNullable<Json>,"retrieved_at"?: string,"title"?: string | null,"url"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_records_data_source_id_fkey"
      columns: ["data_source_id"]
isOneToOne: false
      referencedRelation: "data_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_records_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"suppression_entries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"kind": string,"notes": string | null,"reason": string,"value": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"notes"?: string | null,"reason": string,"value": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"notes"?: string | null,"reason"?: string,"value"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppression_entries_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"system_errors": {
                  Row: {
                    "context": NonNullable<Json>,"correlation_id": string | null,"created_at": string,"id": number,"message": string,"resolved_at": string | null,"source": string,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "context"?: NonNullable<Json>,"correlation_id"?: string | null,"created_at"?: string,"id"?: never,"message": string,"resolved_at"?: string | null,"source": string,"workspace_id"?: string | null
                  }
                  Update: {
                    "context"?: NonNullable<Json>,"correlation_id"?: string | null,"created_at"?: string,"id"?: never,"message"?: string,"resolved_at"?: string | null,"source"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "system_errors_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assigned_to": string | null,"completed_at": string | null,"contact_id": string | null,"conversation_id": string | null,"created_at": string,"created_by": string | null,"draft_id": string | null,"due_at": string | null,"id": string,"kind": string,"notes": string | null,"organisation_id": string | null,"source": string,"status": string,"title": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"completed_at"?: string | null,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"draft_id"?: string | null,"due_at"?: string | null,"id"?: string,"kind"?: string,"notes"?: string | null,"organisation_id"?: string | null,"source"?: string,"status"?: string,"title": string,"workspace_id": string
                  }
                  Update: {
                    "assigned_to"?: string | null,"completed_at"?: string | null,"contact_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"draft_id"?: string | null,"due_at"?: string | null,"id"?: string,"kind"?: string,"notes"?: string | null,"organisation_id"?: string | null,"source"?: string,"status"?: string,"title"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_draft_id_fkey"
      columns: ["draft_id"]
isOneToOne: false
      referencedRelation: "outreach_drafts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "active_workspace_id": string | null,"display_name": string | null,"preferences": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_workspace_id"?: string | null,"display_name"?: string | null,"preferences"?: NonNullable<Json>,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active_workspace_id"?: string | null,"display_name"?: string | null,"preferences"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_preferences_active_workspace_id_fkey"
      columns: ["active_workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"voice_feedback": {
                  Row: {
                    "applied_to_version_id": string | null,"created_at": string,"created_by": string | null,"disposition": string,"draft_version_id": string | null,"final_text": string,"id": string,"original_text": string,"preference_text": string | null,"replaces_preference": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_to_version_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"disposition": string,"draft_version_id"?: string | null,"final_text": string,"id"?: string,"original_text": string,"preference_text"?: string | null,"replaces_preference"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "applied_to_version_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"disposition"?: string,"draft_version_id"?: string | null,"final_text"?: string,"id"?: string,"original_text"?: string,"preference_text"?: string | null,"replaces_preference"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vf_draft_version_fk"
      columns: ["draft_version_id"]
isOneToOne: false
      referencedRelation: "draft_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "voice_feedback_applied_to_version_id_fkey"
      columns: ["applied_to_version_id"]
isOneToOne: false
      referencedRelation: "voice_profile_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "voice_feedback_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"voice_profile_versions": {
                  Row: {
                    "agent_execution_id": string | null,"created_at": string,"created_by": string | null,"dna": NonNullable<Json>,"examples": NonNullable<Json>,"generation_prompt": string,"id": string,"preferences": NonNullable<Json>,"profile_id": string,"sample_ids": (string)[],"source": string,"version_no": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_execution_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"dna": NonNullable<Json>,"examples"?: NonNullable<Json>,"generation_prompt": string,"id"?: string,"preferences"?: NonNullable<Json>,"profile_id": string,"sample_ids"?: (string)[],"source": string,"version_no": number,"workspace_id": string
                  }
                  Update: {
                    "agent_execution_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"dna"?: NonNullable<Json>,"examples"?: NonNullable<Json>,"generation_prompt"?: string,"id"?: string,"preferences"?: NonNullable<Json>,"profile_id"?: string,"sample_ids"?: (string)[],"source"?: string,"version_no"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "voice_profile_versions_agent_execution_id_fkey"
      columns: ["agent_execution_id"]
isOneToOne: false
      referencedRelation: "agent_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "voice_profile_versions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "voice_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "voice_profile_versions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"voice_profiles": {
                  Row: {
                    "active_version_id": string | null,"created_at": string,"id": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_version_id"?: string | null,"created_at"?: string,"id"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active_version_id"?: string | null,"created_at"?: string,"id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "voice_profiles_active_fk"
      columns: ["active_version_id"]
isOneToOne: false
      referencedRelation: "voice_profile_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "voice_profiles_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"role": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_settings": {
                  Row: {
                    "approval_ttl_hours": number,"daily_send_cap": number,"min_hours_between_org_sends": number,"onboarding": NonNullable<Json>,"pricing_ranges": NonNullable<Json>,"require_compliance_check": boolean,"send_window_end": string,"send_window_start": string,"tracking_pixels_enabled": boolean,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_ttl_hours"?: number,"daily_send_cap"?: number,"min_hours_between_org_sends"?: number,"onboarding"?: NonNullable<Json>,"pricing_ranges"?: NonNullable<Json>,"require_compliance_check"?: boolean,"send_window_end"?: string,"send_window_start"?: string,"tracking_pixels_enabled"?: boolean,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "approval_ttl_hours"?: number,"daily_send_cap"?: number,"min_hours_between_org_sends"?: number,"onboarding"?: NonNullable<Json>,"pricing_ranges"?: NonNullable<Json>,"require_compliance_check"?: boolean,"send_window_end"?: string,"send_window_start"?: string,"tracking_pixels_enabled"?: boolean,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_settings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"default_market": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_market"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_market"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"writing_samples": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"is_negative": boolean,"kind": string,"title": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"is_negative"?: boolean,"kind"?: string,"title"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"is_negative"?: boolean,"kind"?: string,"title"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "writing_samples_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_apply_ws_rls":
{ Args: { "tbl": string,"write_roles"?: (string)[] }; Returns: undefined
                           },
"claim_jobs":
{ Args: { "p_limit"?: number,"p_worker": string }; Returns: {
              "attempts": number,
"correlation_id": string,
"cost_usd": number,
"created_at": string,
"created_by": string | null,
"finished_at": string | null,
"id": string,
"idempotency_key": string | null,
"last_error": string | null,
"locked_at": string | null,
"locked_by": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"result": Json | null,
"run_after": string,
"status": string,
"timeout_seconds": number,
"type": string,
"updated_at": string,
"workspace_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"complete_send":
{ Args: { "p_actor"?: string,"p_delivery_status": string,"p_provider_message_id": string,"p_provider_response": Json,"p_provider_thread_id": string,"p_send_job_id": string }; Returns: string
                           },
"confirm_manual_send":
{ Args: { "p_approval_id": string }; Returns: string
                           },
"decide_approval":
{ Args: { "p_approval_id": string,"p_decision": string,"p_reason"?: string,"p_snooze_until"?: string }; Returns: string
                           },
"fail_send":
{ Args: { "p_error": string,"p_http_status": number,"p_retryable": boolean,"p_send_job_id": string }; Returns: undefined
                           },
"finish_job":
{ Args: { "p_cost"?: number,"p_error": string,"p_job_id": string,"p_ok": boolean,"p_result": Json }; Returns: undefined
                           },
"funnel_summary":
{ Args: { "p_from": string,"p_include_demo"?: boolean,"p_market"?: string,"p_to": string,"p_workspace_id": string }; Returns: Json
                           },
"has_workspace_role":
{ Args: { "roles": (string)[],"ws": string }; Returns: boolean
                           },
"is_workspace_member":
{ Args: { "ws": string }; Returns: boolean
                           },
"kpi_summary":
{ Args: { "p_from": string,"p_include_demo"?: boolean,"p_market"?: string,"p_to": string,"p_workspace_id": string }; Returns: Json
                           },
"preflight_send":
{ Args: { "p_approval_id": string,"p_claim"?: boolean }; Returns: Json
                           },
"request_approval":
{ Args: { "p_draft_id": string,"p_proposed_send_at"?: string }; Returns: string
                           },
"reset_demo_data":
{ Args: { "p_workspace_id": string }; Returns: Json
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
