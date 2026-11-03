fn main() {
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let repository = here.ancestors().nth(5).unwrap();
    let api = here.join("api");
    for (files, module) in [
        (
            vec!["hello_constructors/v1/hello.proto"],
            "crate::hello_constructors::v1",
        ),
        (vec!["hello_tasks/v1/hello.proto"], "crate::hello_tasks::v1"),
        (
            vec!["bank/v1/account.proto", "bank/v1/errors.proto"],
            "crate::bank::v1",
        ),
    ] {
        let mut files: Vec<_> = files.iter().map(|p| api.join(p)).collect();
        if module == "crate::bank::v1" && cfg!(feature = "bank-shared") {
            files.push(api.join("bank/v1/bank.proto"));
        }
        reboot::build::compile_protos_with_runtime(
            &files,
            &[api.clone(), repository.to_owned()],
            module,
            "reboot",
        )
        .unwrap();
    }
}
