"""Baseline Relational Schema Migration (Alembic Revision 0001_baseline).

This migration establishes the complete 12-table baseline relational schema for the Credit
Reporting Mechanism Platform (CRMS). It creates core tables for users, credit providers,
credit entities, directorship links, ingest audit logs, the bitemporal credit ledger,
the feature store, model versions, calculated scores, credit enquiries, statutory disputes,
and immutable system audit logs.

Architecture Tier:
    Database Infrastructure / Schema Governance Layer.

Regulatory Context:
    - Privacy Act 1988 (Cth) Part IIIA & Privacy (Credit Reporting) Code 2014.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001_baseline'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Executes forward migration, creating all 12 core tables and associated indexes."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # 1. users
    if 'users' not in existing_tables:
        op.create_table(
            'users',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('email', sa.String(), nullable=False),
            sa.Column('password_hash', sa.String(), nullable=False),
            sa.Column('role', sa.String(), nullable=False, server_default='SUBJECT'),
            sa.Column('tenant_id', sa.String(), nullable=True),
            sa.Column('entity_id', sa.String(), nullable=True),
            sa.Column('totp_secret', sa.String(), nullable=True),
            sa.Column('mfa_enabled', sa.Boolean(), server_default='0', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )
        op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # 2. providers
    if 'providers' not in existing_tables:
        op.create_table(
            'providers',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('licence_type', sa.String(), nullable=False),
            sa.Column('permitted_data_types', sa.JSON(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )

    # 3. entities
    if 'entities' not in existing_tables:
        op.create_table(
            'entities',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('type', sa.String(), nullable=False),
            sa.Column('identifier', sa.String(), nullable=False),
            sa.Column('identifier_blind_index', sa.String(), nullable=True),
            sa.Column('basic_info', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )
        op.create_index('ix_entities_identifier_blind_index', 'entities', ['identifier_blind_index'])

    # 4. director_links
    if 'director_links' not in existing_tables:
        op.create_table(
            'director_links',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('company_entity_id', sa.String(), sa.ForeignKey('entities.id'), nullable=False),
            sa.Column('individual_entity_id', sa.String(), sa.ForeignKey('entities.id'), nullable=False),
            sa.Column('role', sa.String(), server_default='DIRECTOR', nullable=False),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('end_date', sa.Date(), nullable=True)
        )

    # 5. ingest_events
    if 'ingest_events' not in existing_tables:
        op.create_table(
            'ingest_events',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('provider_id', sa.String(), nullable=True),
            sa.Column('raw_payload', sa.JSON(), nullable=False),
            sa.Column('status', sa.String(), nullable=False),
            sa.Column('error_log', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )

    # 6. credit_ledger
    if 'credit_ledger' not in existing_tables:
        op.create_table(
            'credit_ledger',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('entity_id', sa.String(), sa.ForeignKey('entities.id'), nullable=False),
            sa.Column('record_type', sa.String(), nullable=False),
            sa.Column('data', sa.JSON(), nullable=False),
            sa.Column('amount', sa.Numeric(12, 2), nullable=True),
            sa.Column('valid_from', sa.Date(), nullable=False),
            sa.Column('valid_to', sa.Date(), nullable=True),
            sa.Column('recorded_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('provider_id', sa.String(), nullable=True),
            sa.Column('status', sa.String(), server_default='ACTIVE', nullable=False)
        )
        op.create_index('ix_credit_ledger_entity_id', 'credit_ledger', ['entity_id'])

    # 7. feature_store
    if 'feature_store' not in existing_tables:
        op.create_table(
            'feature_store',
            sa.Column('entity_id', sa.String(), sa.ForeignKey('entities.id'), primary_key=True),
            sa.Column('last_updated', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('features', sa.JSON(), nullable=False)
        )

    # 8. model_versions
    if 'model_versions' not in existing_tables:
        op.create_table(
            'model_versions',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('type', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('weights', sa.JSON(), nullable=False),
            sa.Column('band_thresholds', sa.JSON(), nullable=False),
            sa.Column('active', sa.Boolean(), server_default='0', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )

    # 9. scores
    if 'scores' not in existing_tables:
        op.create_table(
            'scores',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('entity_id', sa.String(), sa.ForeignKey('entities.id'), nullable=False),
            sa.Column('model_version_id', sa.String(), sa.ForeignKey('model_versions.id'), nullable=False),
            sa.Column('score_value', sa.Integer(), nullable=False),
            sa.Column('band', sa.String(), nullable=False),
            sa.Column('sub_scores', sa.JSON(), nullable=False),
            sa.Column('top_factors', sa.JSON(), nullable=False),
            sa.Column('calculated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )
        op.create_index('ix_scores_entity_id', 'scores', ['entity_id'])

    # 10. enquiries
    if 'enquiries' not in existing_tables:
        op.create_table(
            'enquiries',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('entity_id', sa.String(), sa.ForeignKey('entities.id'), nullable=False),
            sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('reason', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )
        op.create_index('ix_enquiries_entity_id', 'enquiries', ['entity_id'])

    # 11. disputes
    if 'disputes' not in existing_tables:
        op.create_table(
            'disputes',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('ledger_record_id', sa.String(), sa.ForeignKey('credit_ledger.id'), nullable=False),
            sa.Column('entity_id', sa.String(), sa.ForeignKey('entities.id'), nullable=False),
            sa.Column('status', sa.String(), server_default='OPEN', nullable=False),
            sa.Column('notes', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('resolved_at', sa.DateTime(), nullable=True)
        )

    # 12. audit_log
    if 'audit_log' not in existing_tables:
        op.create_table(
            'audit_log',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('user_id', sa.String(), nullable=True),
            sa.Column('action', sa.String(), nullable=False),
            sa.Column('target_table', sa.String(), nullable=False),
            sa.Column('target_id', sa.String(), nullable=True),
            sa.Column('before_state', sa.JSON(), nullable=True),
            sa.Column('after_state', sa.JSON(), nullable=True),
            sa.Column('details', sa.JSON(), nullable=True),
            sa.Column('timestamp', sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )


def downgrade() -> None:
    """Rolls back the baseline migration by dropping all 12 tables in reverse dependency order."""
    for table_name in [
        'audit_log', 'disputes', 'enquiries', 'scores', 'model_versions',
        'feature_store', 'credit_ledger', 'ingest_events', 'director_links',
        'entities', 'providers', 'users'
    ]:
        op.drop_table(table_name)
