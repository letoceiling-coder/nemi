import logging

from app import logs


def test_redact_keys_tokens_passwords_and_queries():
    s = ('key sk-or-v1-0000aaaa1111bbbb2222cccc3333dddd Authorization: Bearer abc.def-123456789 '
         '{"password": "hunter22", "value":"s3cr3t"} "GET /api/v1/memory?q=мой+диагноз HTTP/1.1" sk-sa-FAKEfakeFAKEfake-0000000')
    r = logs.redact(s)
    for leaked in ["0000aaaa", "abc.def-123456789", "hunter22", "s3cr3t", "диагноз", "FAKEfake"]:
        assert leaked not in r, leaked
    assert "/api/v1/memory?…" in r and "sk-***" in r


def test_file_log_is_redacted_and_tail_filters_level():
    path = logs.setup_logging()
    assert "pai-test-" in str(path)                       # never the real data dir
    lg = logging.getLogger("pai.test")
    lg.info("plain info line")
    lg.warning("leaky warning token=abcdefgh123")
    try:
        raise RuntimeError("boom with Bearer zzzzzzzzzzzz")
    except RuntimeError:
        lg.error("failure", exc_info=True)
    for h in logging.getLogger().handlers:
        h.flush()
    text = path.read_text(encoding="utf-8")
    assert "abcdefgh123" not in text and "zzzzzzzzzzzz" not in text and "boom with Bearer ***" in text
    warn = logs.tail(50, "WARNING")
    assert any("leaky warning" in l for l in warn) and not any("plain info line" in l for l in warn)
    assert any("plain info line" in l for l in logs.tail(50))
