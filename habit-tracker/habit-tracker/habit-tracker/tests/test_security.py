from app.security import hash_password, verify_password


def test_password_hash_is_salted_and_verifiable():
    first = hash_password("Correct horse battery staple")
    second = hash_password("Correct horse battery staple")
    assert first != second
    assert verify_password("Correct horse battery staple", first)
    assert not verify_password("wrong password", first)
