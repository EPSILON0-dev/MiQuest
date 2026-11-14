class DomainError(Exception):
    def __init__(self, code: str, message: str | None = None, details: dict[str, object] | None = None) -> None:
        self.code = code
        self.message = message or code
        self.details = details or {}
        super().__init__(f'{code}: {self.message}')
