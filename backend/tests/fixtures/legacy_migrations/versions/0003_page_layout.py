"""Add page layout without modifying previously deployed revisions."""
from alembic import op

revision = '0003_page_layout'
down_revision = '0002_review_runs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE pages ADD COLUMN layout TEXT NOT NULL DEFAULT 'branching' CHECK (layout IN ('branching', 'radial', 'spiral'))")


def downgrade() -> None:
    op.execute('ALTER TABLE pages DROP COLUMN layout')
