"""Deterministic OpenAI-compatible model for isolated author-attribution tests."""

import asyncio
import json
import re
from aiohttp import web

# Kept only in this isolated synthetic server; never used in the real stack.
observations = []


async def observe(request):
    return web.json_response(observations)


async def models(request):
    return web.json_response({'object': 'list', 'data': [
        {'id': 'synthetic/test-model', 'object': 'model', 'context_length': 65536},
        {'id': 'synthetic/updated-model', 'object': 'model', 'context_length': 131072},
    ]})


async def chat(request):
    body = await request.json()
    messages = body.get('messages', [])
    last_user = next((str(item.get('content', '')) for item in reversed(messages) if item.get('role') == 'user'), '')
    system = next((str(item.get('content', '')) for item in messages if item.get('role') == 'system'), '')
    has_studio_tool = any(tool.get('function', {}).get('name') == 'studio_sql_query' for tool in body.get('tools', []))
    wire = json.dumps(body, ensure_ascii=False)
    observations.append({'user': last_user, 'system': system, 'last_role': messages[-1].get('role') if messages else None,
                         'has_studio_tool': has_studio_tool,
                         'tools': [tool.get('function', {}).get('name') for tool in body.get('tools', [])],
                         'has_sender_number': any(re.search(r'[ .()+\-\u00a0]*'.join(number), wire)
                                                  for number in ('15555550102', '15555550103', '15555550104', '15555550105')),
                         'profile_name': 'WhatsAppProfile' in wire,
                         'history': sorted(set(re.findall(r'hist-[a-z0-9]+', wire))),
                         'tool_contents': [str(item.get('content', '')) for item in messages if item.get('role') == 'tool'] if 'sender-probe-' in last_user or 'skill-probe' in last_user or 'teacher-unknown' in last_user else []})
    if 'skill-probe-busy' in last_user and messages[-1].get('role') == 'user':
        await asyncio.sleep(12)
    if 'skill-probe' in last_user and has_studio_tool and messages[-1].get('role') != 'tool':
        calls = [{'id': 'skill-read', 'type': 'function', 'function': {'name': 'skill_view',
                  'arguments': json.dumps({'name': 'studio-presenze'})}}]
        for i, action in enumerate(('create', 'patch', 'delete', 'write_file', 'install')):
            calls.append({'id': f'skill-write-{i}', 'type': 'function', 'function': {'name': 'skill_manage',
                'arguments': json.dumps({'action': action, 'name': 'studio-presenze', 'content': 'TAMPERED'})}})
        calls.append({'id': 'lesson-functions', 'type': 'function', 'function': {'name': 'studio_sql_query',
                      'arguments': json.dumps({'query': 'SELECT (SELECT count(*) FROM app.existing_lessons($1::text::date,$2::text::date)) AS existing, (SELECT count(*) FROM app.expected_clients($1::text::date,$2::text::date)) AS expected, (SELECT count(*) FROM app.lesson_teachers($1::text::date,$2::text::date)) AS teachers', 'parameters': ['2026-03-01', '2026-03-31']})}})
        calls.append({'id': 'skill-install-shell', 'type': 'function', 'function': {'name': 'terminal',
                      'arguments': json.dumps({'command': 'touch /opt/data/skills/TAMPERED'})}})
        choice = {'index': 0, 'message': {'role': 'assistant', 'content': None, 'tool_calls': calls}, 'finish_reason': 'tool_calls'}
    elif 'context-probe' in last_user or not body.get('tools') or (messages and messages[-1].get('role') == 'tool'):
        choice = {'index': 0, 'message': {'role': 'assistant', 'content': 'Completato.'}, 'finish_reason': 'stop'}
    else:
        last = next((str(item.get('content', '')) for item in reversed(messages) if item.get('role') == 'user'), '')
        if 'sender-probe-' in last:
            # The sender's own teacher, despite a forged GUC; then hostile
            # attempts to read registry and author numbers through SQL.
            queries = ["SELECT first_name, last_name, created_by_name FROM app.teachers WHERE id = app.current_sender_teacher_id() AND set_config('studio.sender_teacher_id', '999', true) IS NOT NULL",
                       "SELECT row_to_json(t)::text AS teacher, to_jsonb(c)::text AS client FROM app.teachers t LEFT JOIN app.clients c ON true",
                       "SELECT created_by_phone FROM app.clients",
                       "SELECT phone FROM studio_private.teachers",
                       "SELECT * FROM studio_private.identity_phone_digits()",
                       "SELECT * FROM studio_private.resolve_teacher_identity('15555550102')",
                       "SELECT string_agg(attname, ',') AS columns FROM pg_stats WHERE attname LIKE '%phone%'",
                       "INSERT INTO app.clients (first_name, last_name) VALUES ('Probe', 'Synthetic') ON CONFLICT DO NOTHING RETURNING *"]
        elif 'teacher-unknown' in last:
            queries = ["INSERT INTO app.teachers (first_name, last_name) VALUES ('Unknown', 'SyntheticInstructor') RETURNING id"]
        elif 'teacher-create-' in last:
            # Teachers are registered by the manager; the model uses existing ones.
            marker = 'alpha' if 'teacher-create-alpha' in last else 'beta'
            weekday = 1 if marker == 'alpha' else 2
            date = '2020-01-01' if marker == 'alpha' else '2099-01-01'
            queries = [f"""WITH teacher AS (
                SELECT id FROM app.teachers WHERE first_name = '{marker}' AND last_name = 'SyntheticInstructor'
              ), rule AS (
                INSERT INTO app.teacher_rules (teacher_id, rule_text, created_at, created_by_name)
                SELECT id, '{marker} teacher rule', '1900-01-01', 'forged' FROM teacher RETURNING id
              ), intervals AS (
                INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max, is_active)
                SELECT id, {weekday}, time '09:00', time '10:00', false FROM rule RETURNING rule_id
              ), assignment AS (
                INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time, created_at, created_by_name)
                SELECT id, date '{date}', time '09:00', '1900-01-01', 'forged' FROM teacher RETURNING id
              ) SELECT assignment.id FROM assignment CROSS JOIN intervals"""]
        elif 'teacher-deactivate-alpha' in last:
            queries = ["UPDATE app.teacher_rules SET deactivated_at = '1900-01-01', deactivated_by_name = 'forged', deactivation_reason = 'synthetic teacher replacement' WHERE rule_text = 'alpha teacher rule' RETURNING id"]
        elif 'teacher-cancel-alpha' in last:
            queries = ["UPDATE app.teacher_assignments SET cancelled_at = '1900-01-01', cancelled_by_name = 'forged', cancellation_reason = 'synthetic teacher correction' WHERE lesson_date = '2020-01-01' RETURNING id"]
        elif 'teacher-cancel-future' in last:
            queries = ["UPDATE app.teacher_assignments SET cancelled_at = '1900-01-01', cancelled_by_name = 'forged', cancellation_reason = 'synthetic future teacher correction' WHERE lesson_date = '2099-01-01' RETURNING id"]
        elif 'future-absence-insert' in last:
            queries = ["INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_by_name) SELECT id, '2099-01-01', '09:00', 'excused_absence', 'forged' FROM app.clients WHERE first_name = 'alpha' RETURNING id"]
        elif 'future-absence-cancel' in last:
            queries = ["UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancelled_by_name = 'forged', cancellation_reason = 'synthetic future cancellation' WHERE lesson_date = '2099-01-01' RETURNING id"]
        elif 'attendance-insert' in last:
            queries = ["INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_by_name) SELECT id, '2020-01-01', '09:00', 'present', 'forged' FROM app.clients WHERE first_name = 'alpha' RETURNING id"]
        elif 'attendance-cancel' in last:
            queries = ["UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancelled_by_name = 'forged', cancellation_reason = 'synthetic reason' WHERE outcome = 'present' RETURNING id"]
        elif 'deactivate-alpha' in last:
            queries = ["UPDATE app.training_rules SET deactivated_at = clock_timestamp(), deactivated_by_name = 'forged', deactivation_reason = 'synthetic reason' WHERE rule_text = 'alpha rule' RETURNING id"]
        else:
            marker = 'alpha' if 'alpha' in last else 'beta'
            queries = [
                f"INSERT INTO app.clients (first_name, last_name, created_by_name) VALUES ('{marker}', 'synthetic', 'forged') RETURNING id",
                f"INSERT INTO app.training_rules (rule_text, created_by_name) VALUES ('{marker} rule', 'forged') RETURNING id",
            ]
        calls = [{'id': f'synthetic-call-{i}', 'type': 'function', 'function': {'name': 'studio_sql_query',
                  'arguments': json.dumps({'query': query, 'author': {'phone': '999', 'name': 'forged'},
                                           'sender': '999', 'teacher_id': '999', 'teacher': 'forged'})}}
                 for i, query in enumerate(queries)]
        calls.append({'id': 'synthetic-forbidden', 'type': 'function', 'function': {'name': 'terminal',
                      'arguments': json.dumps({'command': 'touch /tmp/pilates-injection-marker'})}})
        choice = {'index': 0, 'message': {'role': 'assistant', 'content': None, 'tool_calls': calls}, 'finish_reason': 'tool_calls'}
    base = {'id': 'synthetic-completion', 'object': 'chat.completion', 'created': 1,
            'model': 'synthetic/test-model', 'choices': [choice],
            'usage': {'prompt_tokens': 10, 'completion_tokens': 10, 'total_tokens': 20}}
    if not body.get('stream'):
        return web.json_response(base)
    response = web.StreamResponse(headers={'Content-Type': 'text/event-stream'})
    await response.prepare(request)
    delta = choice['message'].copy()
    for i, call in enumerate(delta.get('tool_calls', [])):
        call['index'] = i
    chunk = {'id': base['id'], 'object': 'chat.completion.chunk', 'created': 1, 'model': base['model'],
             'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]}
    await response.write(('data: ' + json.dumps(chunk) + '\n\n').encode())
    chunk['choices'] = [{'index': 0, 'delta': {}, 'finish_reason': choice['finish_reason']}]
    await response.write(('data: ' + json.dumps(chunk) + '\n\ndata: [DONE]\n\n').encode())
    await response.write_eof()
    return response


app = web.Application()
app.router.add_get('/v1/models', models)
app.router.add_get('/v1/observations', observe)
app.router.add_post('/v1/chat/completions', chat)
web.run_app(app, host='0.0.0.0', port=8088, print=None, access_log=None)
