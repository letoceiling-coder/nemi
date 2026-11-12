import os
import tempfile

# Tests must never touch the real user database: point the data dir at a throwaway folder
# before any `app.*` module (and its SQLAlchemy engine) is imported.
os.environ["PAI_DATA_DIR"] = tempfile.mkdtemp(prefix="pai-test-")
