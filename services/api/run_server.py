"""Entry point of the packaged backend (nemi-api.exe, built by build_sidecar.ps1).
The desktop app starts it hidden; it listens on localhost only."""
import multiprocessing

import uvicorn

from app.config import settings
from app.main import app

if __name__ == "__main__":
    multiprocessing.freeze_support()
    # app object, not "app.main:app": the frozen build has no importable source tree
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")
