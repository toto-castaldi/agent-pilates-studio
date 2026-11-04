"""Native Hermes adapter for the project's PostgreSQL agent role."""

import json
import os
from pathlib import Path

import asyncpg


async def execute_query(args, **kwargs):
    """Run a single SQL statement; PostgreSQL enforces the agent's privileges."""
    if not isinstance(args, dict):
        return json.dumps({"error": "A SQL query and an optional parameter array are required."})
    query = args.get("query")
    parameters = args.get("parameters", [])
    if not isinstance(query, str) or not query.strip() or not isinstance(parameters, list):
        return json.dumps({"error": "A SQL query and an optional parameter array are required."})

    connection = None
    try:
        password = Path(os.environ.get("PILATES_DB_PASSWORD_FILE", "/run/secrets/db_agent")).read_text().strip()
        if not password:
            return json.dumps({"error": "Database credentials are not configured."})
        connection = await asyncpg.connect(
            host=os.environ.get("PILATES_DB_HOST", "postgres"),
            port=int(os.environ.get("PILATES_DB_PORT", "5432")),
            database="studio",
            user="studio_agent",
            password=password,
            timeout=10,
            command_timeout=30,
        )
        statement = await connection.prepare(query)
        rows = await statement.fetch(*parameters)
        return json.dumps(
            {"status": statement.get_statusmsg(), "rows": [dict(row) for row in rows]},
            default=str,
        )
    except asyncpg.PostgresError as error:
        return json.dumps({"error": "PostgreSQL rejected the query.", "sqlstate": error.sqlstate})
    except Exception:
        return json.dumps({"error": "Database query could not be executed."})
    finally:
        if connection is not None:
            try:
                await connection.close()
            except Exception:
                pass


def register(ctx):
    ctx.register_tool(
        name="studio_sql_query",
        toolset="studio-postgres",
        schema={
            "name": "studio_sql_query",
            "description": "Execute one PostgreSQL query using the restricted agent role. The database permits DML and rejects DDL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "A single SQL statement; use $1, $2, etc. for parameters."},
                    "parameters": {"type": "array", "items": {}, "description": "Optional positional query parameters."},
                },
                "required": ["query"],
            },
        },
        handler=execute_query,
        is_async=True,
    )
