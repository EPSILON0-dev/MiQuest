from sqlalchemy import (
    REAL,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (CheckConstraint("length(trim(name)) BETWEEN 1 AND 200"), CheckConstraint("revision >= 0"))
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, server_default="")
    revision: Mapped[int] = mapped_column(Integer, server_default="0")
    created_at: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[str] = mapped_column(Text)


class Page(Base):
    __tablename__ = "pages"
    __table_args__ = (UniqueConstraint("id", "project_id"), CheckConstraint("length(trim(name)) BETWEEN 1 AND 200"), Index("ix_pages_project", "project_id"))
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_id: Mapped[str] = mapped_column(Text, ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[str] = mapped_column(Text)


class Quest(Base):
    __tablename__ = "quests"
    __table_args__ = (
        UniqueConstraint("id", "project_id"), CheckConstraint("length(trim(title)) BETWEEN 1 AND 200"),
        CheckConstraint("work_state IN ('not_started', 'in_progress', 'blocked')"),
        CheckConstraint("completion_state IN ('none', 'verified', 'overridden')"), CheckConstraint("milestone IN (0, 1)"),
        ForeignKeyConstraint(["home_page_id", "project_id"], ["pages.id", "pages.project_id"]),
        ForeignKeyConstraint(["home_page_id", "id"], ["quest_appearances.page_id", "quest_appearances.quest_id"], deferrable=True, initially="DEFERRED"),
        Index("ix_quests_project", "project_id"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_id: Mapped[str] = mapped_column(Text, ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, server_default="")
    acceptance_criteria: Mapped[str] = mapped_column(Text, server_default="")
    work_state: Mapped[str] = mapped_column(Text, server_default="not_started")
    completion_state: Mapped[str] = mapped_column(Text, server_default="none")
    icon_name: Mapped[str] = mapped_column(Text)
    milestone: Mapped[int] = mapped_column(Integer, server_default="0")
    home_page_id: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[str] = mapped_column(Text)


class QuestAppearance(Base):
    __tablename__ = "quest_appearances"
    __table_args__ = (
        ForeignKeyConstraint(["page_id", "project_id"], ["pages.id", "pages.project_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["quest_id", "project_id"], ["quests.id", "quests.project_id"], ondelete="CASCADE"),
        Index("ix_appearances_quest", "quest_id"),
    )
    page_id: Mapped[str] = mapped_column(Text, primary_key=True)
    quest_id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_id: Mapped[str] = mapped_column(Text)
    position_x: Mapped[float] = mapped_column(REAL)
    position_y: Mapped[float] = mapped_column(REAL)


class Dependency(Base):
    __tablename__ = "dependencies"
    __table_args__ = (
        CheckConstraint("quest_id <> depends_on_quest_id"),
        ForeignKeyConstraint(["quest_id", "project_id"], ["quests.id", "quests.project_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["depends_on_quest_id", "project_id"], ["quests.id", "quests.project_id"], ondelete="CASCADE"),
        Index("ix_dependencies_prerequisite", "depends_on_quest_id"),
    )
    quest_id: Mapped[str] = mapped_column(Text, primary_key=True)
    depends_on_quest_id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_id: Mapped[str] = mapped_column(Text)


class Pin(Base):
    __tablename__ = "pins"
    __table_args__ = (UniqueConstraint("project_id", "sort_order"), CheckConstraint("sort_order >= 0"), ForeignKeyConstraint(["quest_id", "project_id"], ["quests.id", "quests.project_id"], ondelete="CASCADE"))
    project_id: Mapped[str] = mapped_column(Text, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    quest_id: Mapped[str] = mapped_column(Text, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer)


class Verification(Base):
    __tablename__ = "verifications"
    __table_args__ = (
        UniqueConstraint("quest_id", "sequence"), CheckConstraint("sequence > 0"),
        CheckConstraint("verdict IN ('pass', 'fail', 'inconclusive', 'override', 'reopen')"),
        CheckConstraint("actor IN ('agent', 'human')"), CheckConstraint("length(trim(reasoning)) > 0"),
        CheckConstraint("verdict <> 'pass' OR (actor = 'agent' AND length(trim(evidence)) > 0)"),
        CheckConstraint("verdict <> 'override' OR actor = 'human'"),
        CheckConstraint("verdict NOT IN ('fail', 'inconclusive') OR actor = 'agent'"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    quest_id: Mapped[str] = mapped_column(Text, ForeignKey("quests.id", ondelete="CASCADE"))
    sequence: Mapped[int] = mapped_column(Integer)
    verdict: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text, server_default="")
    reasoning: Mapped[str] = mapped_column(Text)
    snapshot_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text)


class ReviewRun(Base):
    __tablename__ = 'review_runs'
    __table_args__ = (
        CheckConstraint("status IN ('waiting', 'reviewing', 'saving', 'completed', 'error', 'interrupted')"),
        Index('ix_review_runs_quest', 'quest_id'),
        Index('uq_review_runs_active_quest', 'quest_id', unique=True,
              sqlite_where=text("status IN ('waiting', 'reviewing', 'saving')")),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    quest_id: Mapped[str] = mapped_column(Text, ForeignKey('quests.id', ondelete='CASCADE'))
    status: Mapped[str] = mapped_column(Text)
    message: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    effort: Mapped[str] = mapped_column(Text)
    snapshot_json: Mapped[str] = mapped_column(Text)
    verdict: Mapped[str | None] = mapped_column(Text, nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    unmet_json: Mapped[str] = mapped_column(Text)
    completion_applied: Mapped[int] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_id: Mapped[str | None] = mapped_column(Text, ForeignKey('verifications.id', ondelete='SET NULL'), nullable=True)
    usage_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[str] = mapped_column(Text)


class ReviewAttachment(Base):
    __tablename__ = 'review_attachments'
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    run_id: Mapped[str] = mapped_column(Text, ForeignKey('review_runs.id', ondelete='CASCADE'), index=True)
    name: Mapped[str] = mapped_column(Text)
    media_type: Mapped[str] = mapped_column(Text)
    size: Mapped[int] = mapped_column(Integer)
    original_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    retained_path: Mapped[str] = mapped_column(Text)
