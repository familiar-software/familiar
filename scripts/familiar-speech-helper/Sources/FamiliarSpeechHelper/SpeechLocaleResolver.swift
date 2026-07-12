import Foundation

func resolveSupportedLocale(
    requested: Locale,
    equivalent: Locale?,
    supported: [Locale]
) -> Locale? {
    if let exact = findLocale(requested, in: supported) {
        return exact
    }
    if let equivalent, let matched = findLocale(equivalent, in: supported) {
        return matched
    }

    let languageCode = requested.language.languageCode?.identifier
    guard let languageCode else {
        return nil
    }
    return supported.first { locale in
        locale.language.languageCode?.identifier == languageCode
    }
}

private func findLocale(_ target: Locale, in locales: [Locale]) -> Locale? {
    let identifier = normalizedLocaleIdentifier(target)
    return locales.first { normalizedLocaleIdentifier($0) == identifier }
}

private func normalizedLocaleIdentifier(_ locale: Locale) -> String {
    locale.identifier.replacingOccurrences(of: "_", with: "-").lowercased()
}
