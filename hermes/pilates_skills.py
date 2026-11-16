"""Read-only native skill boundary for the pinned Hermes gateway (ADR-004)."""


def install():
    from tools.registry import registry
    import agent.prompt_builder as prompts
    import agent.skill_commands as commands
    import agent.skill_bundles as bundles
    from gateway.run_inbound import GatewayInboundMixin
    from gateway.run_busy import GatewayBusySessionMixin
    from hermes_cli.commands import is_gateway_known_command, resolve_command

    # Guard both already-imported and lazy registrations. This is not the sole
    # execution guard: pilates_trusted also checks both dispatcher paths.
    original_register = registry.register

    def register(*args, **kwargs):
        name = kwargs.get('name', args[0] if args else None)
        if name not in ('skill_manage', 'skills_list'):
            return original_register(*args, **kwargs)
        return None

    registry.register = register
    for name in ('skill_manage', 'skills_list'):
        registry.deregister(name)

    original_index = prompts._render_skills_index

    def index(*args, **kwargs):
        rendered = original_index(*args, **kwargs)
        return rendered.replace("If a skill has issues, fix it with skill_manage(action='patch').\n", '').replace(
            'After difficult/iterative tasks, offer to save as a skill. If a skill you loaded was missing steps, '
            'had wrong commands, or needed pitfalls you discovered, update it before finishing.\n', '')

    prompts._render_skills_index = index

    # All non-tool loaders (commands, plugin commands, stacks, bundles, preload,
    # automatic skills) converge here. Do not replace tools.skills_tool.skill_view:
    # its native history deduplication and compaction reload markers must survive.
    commands._load_skill_payload = lambda *args, **kwargs: None
    commands.get_skill_commands = lambda: {}
    commands.get_plugin_skill_commands = lambda: {}
    commands.get_interactive_skill_commands = lambda: {}
    bundles.get_skill_bundles = lambda: {}

    original_handle = GatewayInboundMixin._handle_message

    def denied(self, event):
        command = event.get_command()
        if command:
            # Follow alias expansion using Hermes' own parser, but on a copy:
            # native commands and their arguments still receive the original.
            from copy import copy
            probe = copy(event)
            seen = set()
            while command and not resolve_command(command):
                if command in seen:
                    break
                seen.add(command)
                alias = self._hm_quick_commands().get(command)
                if not alias or alias.get('type') != 'alias':
                    break
                command = self._hm_expand_alias_quick_command(probe, alias)
            definition = resolve_command(command) if command else None
            canonical = definition.name if definition else command
            if not canonical or not is_gateway_known_command(canonical):
                return True
        return False

    async def handle(self, event):
        if denied(self, event):
            return 'Comando non disponibile.'
        # Before session creation and busy/queue/steer dispatch, so this also
        # protects the first message of a new conversation and in-flight turns.
        return await original_handle(self, event)

    GatewayInboundMixin._handle_message = handle

    original_busy = GatewayBusySessionMixin._busy_skill_turn

    async def busy(self, event, source, session_key, adapter=None):
        if denied(self, event):
            return True, 'Comando non disponibile.'
        return await original_busy(self, event, source, session_key, adapter)

    GatewayBusySessionMixin._busy_skill_turn = busy
