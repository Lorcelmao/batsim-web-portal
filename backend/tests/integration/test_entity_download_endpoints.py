"""Download endpoints must return the file itself, not a path to it.

These endpoints previously responded with JSON {file_path, file_name}, where
file_path was the server's absolute path. The UI opened that path in a new tab,
which resolved to nothing on a deployed instance, and the response also exposed
the server's filesystem layout to any authenticated caller.

The contract asserted here: a byte-identical file body plus an attachment
Content-Disposition, and no server path anywhere in the response.
"""

import pytest

ENDPOINTS = (
    ("workloads", "create_workload"),
    ("platforms", "create_platform"),
    ("strategies", "create_strategy"),
)


@pytest.fixture
def entity_factories(create_workload, create_platform, create_strategy):
    return {
        "create_workload": create_workload,
        "create_platform": create_platform,
        "create_strategy": create_strategy,
    }


@pytest.mark.parametrize("kind,factory_name", ENDPOINTS)
def test_download_returns_file_bytes(client, auth_headers, entity_factories, kind, factory_name):
    entity = entity_factories[factory_name]()

    response = client.get(f"/api/{kind}/{entity.id}/download", headers=auth_headers)

    assert response.status_code == 200
    with open(entity.file_path, "rb") as handle:
        assert response.content == handle.read()


@pytest.mark.parametrize("kind,factory_name", ENDPOINTS)
def test_download_sets_attachment_disposition(
    client, auth_headers, entity_factories, kind, factory_name
):
    entity = entity_factories[factory_name]()

    response = client.get(f"/api/{kind}/{entity.id}/download", headers=auth_headers)

    disposition = response.headers.get("content-disposition", "")
    assert "attachment" in disposition.lower()
    # Without a filename the browser saves the numeric route segment instead.
    assert "filename" in disposition.lower()


@pytest.mark.parametrize("kind,factory_name", ENDPOINTS)
def test_download_does_not_leak_server_paths(
    client, auth_headers, entity_factories, kind, factory_name
):
    """The old JSON response handed callers an absolute server path."""
    entity = entity_factories[factory_name]()

    response = client.get(f"/api/{kind}/{entity.id}/download", headers=auth_headers)

    assert b'"file_path"' not in response.content
    assert entity.file_path.encode() not in response.content


@pytest.mark.parametrize("kind,_factory", ENDPOINTS)
def test_download_missing_record_returns_404(client, auth_headers, kind, _factory):
    response = client.get(f"/api/{kind}/999999/download", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.parametrize("kind,factory_name", ENDPOINTS)
def test_download_missing_file_returns_404(
    client, auth_headers, entity_factories, kind, factory_name, tmp_path
):
    """A row whose file vanished must 404 rather than raise on the file read."""
    entity = entity_factories[factory_name]()
    import os

    os.remove(entity.file_path)

    response = client.get(f"/api/{kind}/{entity.id}/download", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.parametrize("kind,factory_name", ENDPOINTS)
def test_download_requires_authentication(client, entity_factories, kind, factory_name):
    """Downloads are authenticated, which is why the UI cannot use a plain link."""
    entity = entity_factories[factory_name]()

    response = client.get(f"/api/{kind}/{entity.id}/download")

    assert response.status_code in (401, 403)
