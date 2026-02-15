import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FileStateStore:
    def __init__(self, base_dir: Path, tenant_id: str ="local") -> None:
        self.base_dir = base_dir
        self.tenant_id = tenant_id

    def _session_dir(self, agent_session_id: str) -> Path:
        return self.base_dir / "tenants" / self.tenant_id / "agent_sessions" / agent_session_id

    def get_or_create_session(self, agent_session_id: str | None) -> tuple[str, str]:
        agent_session_id = agent_session_id or str(uuid4())
        session_dir = self._session_dir(agent_session_id)
        session_dir.mkdir(parents=True, exist_ok=True)

        state_path = session_dir / "state.json"
        if state_path.exists():
            state = json.loads(state_path.read_text(encoding="utf-8"))
            return agent_session_id, state["workspace_id"]

        workspace_id = str(uuid4())
        state_path.write_text(
            json.dumps(
                {"agent_session_id": agent_session_id, "workspace_id": workspace_id, "created_at": utc_now_iso()},
                indent=2,
            ),
            encoding="utf-8"
        )
        (session_dir / "messages.jsonl").touch(exist_ok=True)
        return agent_session_id, workspace_id

    def append_message(self, agent_session_id: str, role: str, content: str) -> None:
        msg = {"timestamp": utc_now_iso(), "role": role, "content": content}
        path = self._session_dir(agent_session_id) / "messages.jsonl"
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(msg) + "\n")
