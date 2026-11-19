from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import Connection

from miquest.models import Base

config = context.config


def run_migrations(connection: Connection) -> None:
    with connection.begin():
        connection.exec_driver_sql("BEGIN")
        context.configure(connection=connection, target_metadata=Base.metadata, transactional_ddl=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    connection = config.attributes.get("connection")
    if connection is not None:
        run_migrations(connection)
    else:
        engine = engine_from_config(config.get_section(config.config_ini_section) or {}, prefix="sqlalchemy.", poolclass=pool.NullPool)
        with engine.connect() as connection:
            run_migrations(connection)
