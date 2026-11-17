"""Persist user-triggered review runs."""
from alembic import op

revision = '0002_review_runs'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE review_runs (
        id TEXT NOT NULL PRIMARY KEY,
        quest_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('waiting', 'reviewing', 'saving', 'completed', 'error', 'interrupted')),
        message TEXT NOT NULL, model TEXT NOT NULL, effort TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, verdict TEXT, reasoning TEXT, unmet_json TEXT NOT NULL,
        completion_applied INTEGER NOT NULL, error TEXT,
        verification_id TEXT,
        usage_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
        FOREIGN KEY (verification_id) REFERENCES verifications(id) ON DELETE SET NULL
    )""")
    op.execute('CREATE INDEX ix_review_runs_quest ON review_runs (quest_id)')
    op.execute("CREATE UNIQUE INDEX uq_review_runs_active_quest ON review_runs (quest_id) WHERE status IN ('waiting', 'reviewing', 'saving')")
    op.execute("""CREATE TABLE review_attachments (
        id TEXT NOT NULL PRIMARY KEY, run_id TEXT NOT NULL, name TEXT NOT NULL,
        media_type TEXT NOT NULL, size INTEGER NOT NULL, original_path TEXT, retained_path TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES review_runs(id) ON DELETE CASCADE
    )""")
    op.execute('CREATE INDEX ix_review_attachments_run_id ON review_attachments (run_id)')


def downgrade() -> None:
    op.execute('DROP TABLE review_attachments')
    op.execute('DROP TABLE review_runs')
