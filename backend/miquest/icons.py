import emoji

ICON_NAMES: frozenset[str] = frozenset(('compass', 'search', 'users', 'sparkles', 'layers', 'box', 'message-circle', 'flag', 'book-open', 'palette', 'globe', 'check-circle', 'rocket', 'home', 'sun', 'lightbulb', 'pen-tool', 'send'))

def valid_icon(value: object) -> bool:
    if not isinstance(value, str):
        return False
    if value in ICON_NAMES:
        return True
    if not value.startswith('emoji:'):
        return False
    symbol = value.removeprefix('emoji:')
    return symbol not in ('🏻', '🏼', '🏽', '🏾', '🏿') and emoji.is_emoji(symbol)
