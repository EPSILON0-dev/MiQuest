from alembic import context
from sqlalchemy import engine_from_config, inspect, pool
from sqlalchemy.engine import Connection

from miquest.models import Base

config = context.config


def run_migrations(connection: Connection) -> None:
    with connection.begin():
        connection.exec_driver_sql("BEGIN")
        config.attributes.pop('legacy_revision', None)
        if inspect(connection).has_table('alembic_version'):
            versions = connection.exec_driver_sql('SELECT version_num FROM alembic_version').scalars().all()
            if len(versions) == 1 and versions[0] in ('0001_initial', '0002_review_runs'):
                config.attributes['legacy_revision'] = versions[0]
                connection.exec_driver_sql('DELETE FROM alembic_version')
        context.configure(connection=connection, target_metadata=Base.metadata, transactional_ddl=True)
        with context.begin_transaction():
            context.run_migrations()
        if 'legacy_revision' in config.attributes:
            raise RuntimeError('Legacy databases must be upgraded to head first')


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
