"""Create the initial MiQuest schema."""
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TABLE projects (\n    id TEXT PRIMARY KEY NOT NULL,\n    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),\n    description TEXT NOT NULL DEFAULT '',\n    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL\n)")
    op.execute('CREATE TABLE pages (\n    id TEXT PRIMARY KEY NOT NULL,\n    project_id TEXT NOT NULL,\n    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    UNIQUE (id, project_id),\n    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE\n)')
    op.execute("CREATE TABLE quests (\n    id TEXT PRIMARY KEY NOT NULL,\n    project_id TEXT NOT NULL,\n    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),\n    description TEXT NOT NULL DEFAULT '',\n    acceptance_criteria TEXT NOT NULL DEFAULT '',\n    work_state TEXT NOT NULL DEFAULT 'not_started'\n        CHECK (work_state IN ('not_started', 'in_progress', 'blocked')),\n    completion_state TEXT NOT NULL DEFAULT 'none'\n        CHECK (completion_state IN ('none', 'verified', 'overridden')),\n    icon_name TEXT NOT NULL,\n    milestone INTEGER NOT NULL DEFAULT 0 CHECK (milestone IN (0, 1)),\n    home_page_id TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    UNIQUE (id, project_id),\n    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,\n    FOREIGN KEY (home_page_id, project_id)\n        REFERENCES pages(id, project_id),\n    FOREIGN KEY (home_page_id, id)\n        REFERENCES quest_appearances(page_id, quest_id)\n        DEFERRABLE INITIALLY DEFERRED\n)")
    op.execute('CREATE TABLE quest_appearances (\n    page_id TEXT NOT NULL,\n    quest_id TEXT NOT NULL,\n    project_id TEXT NOT NULL,\n    position_x REAL NOT NULL,\n    position_y REAL NOT NULL,\n    PRIMARY KEY (page_id, quest_id),\n    FOREIGN KEY (page_id, project_id)\n        REFERENCES pages(id, project_id) ON DELETE CASCADE,\n    FOREIGN KEY (quest_id, project_id)\n        REFERENCES quests(id, project_id) ON DELETE CASCADE\n)')
    op.execute('CREATE TABLE dependencies (\n    quest_id TEXT NOT NULL,\n    depends_on_quest_id TEXT NOT NULL,\n    project_id TEXT NOT NULL,\n    PRIMARY KEY (quest_id, depends_on_quest_id),\n    CHECK (quest_id <> depends_on_quest_id),\n    FOREIGN KEY (quest_id, project_id)\n        REFERENCES quests(id, project_id) ON DELETE CASCADE,\n    FOREIGN KEY (depends_on_quest_id, project_id)\n        REFERENCES quests(id, project_id) ON DELETE CASCADE\n)')
    op.execute('CREATE TABLE pins (\n    project_id TEXT NOT NULL,\n    quest_id TEXT NOT NULL,\n    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),\n    PRIMARY KEY (project_id, quest_id),\n    UNIQUE (project_id, sort_order),\n    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,\n    FOREIGN KEY (quest_id, project_id)\n        REFERENCES quests(id, project_id) ON DELETE CASCADE\n)')
    op.execute("CREATE TABLE verifications (\n    id TEXT PRIMARY KEY NOT NULL,\n    quest_id TEXT NOT NULL,\n    sequence INTEGER NOT NULL CHECK (sequence > 0),\n    verdict TEXT NOT NULL\n        CHECK (verdict IN ('pass', 'fail', 'inconclusive', 'override', 'reopen')),\n    actor TEXT NOT NULL CHECK (actor IN ('agent', 'human')),\n    evidence TEXT NOT NULL DEFAULT '',\n    reasoning TEXT NOT NULL CHECK (length(trim(reasoning)) > 0),\n    snapshot_json TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    UNIQUE (quest_id, sequence),\n    CHECK (verdict <> 'pass' OR\n        (actor = 'agent' AND length(trim(evidence)) > 0)),\n    CHECK (verdict <> 'override' OR actor = 'human'),\n    CHECK (verdict NOT IN ('fail', 'inconclusive') OR actor = 'agent'),\n    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE\n)")
    op.execute('CREATE INDEX ix_pages_project ON pages(project_id)')
    op.execute('CREATE INDEX ix_quests_project ON quests(project_id)')
    op.execute('CREATE INDEX ix_appearances_quest ON quest_appearances(quest_id)')
    op.execute('CREATE INDEX ix_dependencies_prerequisite ON dependencies(depends_on_quest_id)')
    op.execute("CREATE TRIGGER verification_no_update\nBEFORE UPDATE ON verifications\nBEGIN\n    SELECT RAISE(ABORT, 'verification records are immutable');\nEND")


def downgrade() -> None:
    op.execute("DELETE FROM quests")
    op.execute("DROP TRIGGER verification_no_update")
    for table in ("verifications", "pins", "dependencies", "quest_appearances", "quests", "pages", "projects"):
        op.execute(f"DROP TABLE {table}")
