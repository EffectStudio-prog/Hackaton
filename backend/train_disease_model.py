from .disease_prediction import train_and_save_model


if __name__ == "__main__":
    result = train_and_save_model()
    print("Disease model trained successfully.")
    print(result)
